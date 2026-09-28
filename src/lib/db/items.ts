import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { endOfDay, overdueCutoff, toLocalDateTime } from '@/lib/dates';
import { type Candidate, isDuplicate } from '@/lib/duplicates';
import type { ExtractedFields, Item, ItemStatus, ItemType, ReminderMode, SourceType } from '@/lib/types';

type ItemRow = {
  id: string;
  type: ItemType;
  title: string;
  status: ItemStatus;
  source_type: SourceType;
  extracted_text: string;
  fields: string;
  attachments: string;
  confidence: number;
  due_at: number | null;
  reminder_mode: ReminderMode;
  next_reminder_at: number | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    sourceType: row.source_type,
    extractedText: row.extracted_text,
    fields: JSON.parse(row.fields) as ExtractedFields,
    attachments: JSON.parse(row.attachments) as string[],
    confidence: row.confidence,
    dueAt: row.due_at,
    reminderMode: row.reminder_mode,
    nextReminderAt: row.next_reminder_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

type NewItem = Pick<Item, 'type' | 'title' | 'sourceType' | 'extractedText' | 'fields' | 'attachments' | 'confidence' | 'dueAt'>;

export async function insertItem(db: SQLiteDatabase, item: NewItem): Promise<Item> {
  const now = Date.now();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO items (id, type, title, source_type, extracted_text, fields, attachments, confidence, due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    item.type,
    item.title,
    item.sourceType,
    item.extractedText,
    JSON.stringify(item.fields),
    JSON.stringify(item.attachments),
    item.confidence,
    item.dueAt,
    now,
    now,
  );
  return (await getItem(db, id))!;
}

/** An active item that is the same thing as `candidate` (same code, PNR, link, or same bill on the same day). */
export async function findDuplicate(db: SQLiteDatabase, candidate: Candidate): Promise<Item | null> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items WHERE status = 'active' ORDER BY created_at DESC LIMIT 500`,
  );
  return rows.map(toItem).find((item) => isDuplicate(candidate, item)) ?? null;
}

export async function getItem(db: SQLiteDatabase, id: string): Promise<Item | null> {
  const row = await db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ?', id);
  return row ? toItem(row) : null;
}

export async function updateItem(
  db: SQLiteDatabase,
  id: string,
  changes: Partial<Pick<Item, 'type' | 'title' | 'fields' | 'dueAt' | 'extractedText' | 'attachments'>>,
): Promise<void> {
  const columns: [string, string | number | null][] = [];
  if (changes.extractedText !== undefined) columns.push(['extracted_text', changes.extractedText]);
  if (changes.attachments !== undefined) columns.push(['attachments', JSON.stringify(changes.attachments)]);
  if (changes.type !== undefined) columns.push(['type', changes.type]);
  if (changes.title !== undefined) columns.push(['title', changes.title]);
  if (changes.fields !== undefined) columns.push(['fields', JSON.stringify(changes.fields)]);
  if (changes.dueAt !== undefined) columns.push(['due_at', changes.dueAt]);
  if (!columns.length) return;
  const sets = columns.map(([column]) => `${column} = ?`);
  const params = columns.map(([, value]) => value);
  await db.runAsync(`UPDATE items SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...params, Date.now(), id);
}

export async function setStatus(db: SQLiteDatabase, id: string, status: ItemStatus): Promise<void> {
  const now = Date.now();
  if (status === 'done') {
    await db.runAsync('UPDATE items SET status = ?, reminder_mode = ?, next_reminder_at = NULL, completed_at = ?, updated_at = ? WHERE id = ?', status, 'none', now, now, id);
    return;
  }
  await db.runAsync(
    'UPDATE items SET status = ?, reminder_mode = CASE WHEN ? = \'active\' THEN \'none\' ELSE reminder_mode END, next_reminder_at = CASE WHEN ? = \'active\' THEN NULL ELSE next_reminder_at END, completed_at = ?, updated_at = ? WHERE id = ?',
    status,
    status,
    status,
    status === 'active' ? null : now,
    now,
    id,
  );
}

export async function deleteItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM items WHERE id = ?', id);
}

/**
 * Items that need attention today: anything overdue or due by tonight, and anything
 * whose reminder fires by tonight.
 */
export async function listToday(db: SQLiteDatabase, now = new Date()): Promise<Item[]> {
  const tonight = endOfDay(now).getTime();
  // Keep old obligations in Inbox/search, but prevent them from crowding out current work.
  const cutoff = overdueCutoff(now).getTime();
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items
     WHERE status = 'active'
       AND ((due_at IS NOT NULL AND due_at <= ? AND due_at >= ?) OR (next_reminder_at IS NOT NULL AND next_reminder_at <= ?))
     ORDER BY COALESCE(MIN(due_at, next_reminder_at), due_at, next_reminder_at) ASC`,
    tonight,
    cutoff,
    tonight,
  );
  return rows.map(toItem);
}

/** Active items with a date in the next `days` days, excluding those already on Today. */
export async function listUpcoming(db: SQLiteDatabase, days = 7, now = new Date()): Promise<Item[]> {
  const tonight = endOfDay(now).getTime();
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items
     WHERE status = 'active' AND due_at > ? AND due_at <= ?
       AND (next_reminder_at IS NULL OR next_reminder_at > ?)
     ORDER BY due_at ASC`,
    tonight,
    tonight + days * 86_400_000,
    tonight,
  );
  return rows.map(toItem);
}

/** Titles of active items due on the same day as `day`, for "also due that day". */
export async function listDueOn(db: SQLiteDatabase, day: Date): Promise<string[]> {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const rows = await db.getAllAsync<{ title: string }>(
    `SELECT title FROM items WHERE status = 'active' AND due_at >= ? AND due_at <= ? ORDER BY due_at LIMIT 4`,
    start,
    endOfDay(day).getTime(),
  );
  return rows.map((row) => row.title);
}

export async function listInbox(db: SQLiteDatabase): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items WHERE status = 'active' ORDER BY created_at DESC LIMIT 200`,
  );
  return rows.map(toItem);
}

/**
 * A collection is an item type, or one of these views across types. Places split
 * into somewhere to eat vs. somewhere to go, as in the plan.
 */
export const VIRTUAL_COLLECTIONS = {
  'travel-ideas': { title: 'Travel Ideas', emoji: '✈️', where: "type = 'place' AND json_extract(fields, '$.placeKind') = 'destination'" },
  warranties: { title: 'Warranties', emoji: '🛡', where: "json_extract(fields, '$.warrantyUntil') IS NOT NULL" },
} as const;
export type VirtualCollection = keyof typeof VIRTUAL_COLLECTIONS;

const PLACES_TO_TRY = "type = 'place' AND COALESCE(json_extract(fields, '$.placeKind'), 'eat') != 'destination'";

export async function listByType(db: SQLiteDatabase, type: ItemType | VirtualCollection): Promise<Item[]> {
  const where = type in VIRTUAL_COLLECTIONS ? VIRTUAL_COLLECTIONS[type as VirtualCollection].where : type === 'place' ? PLACES_TO_TRY : 'type = ?';
  const rows = await db.getAllAsync<ItemRow>(
    // Warranties outlive the purchase being "done", so that view keeps finished items.
    `SELECT * FROM items WHERE ${where} AND status ${type === 'warranties' ? "!= 'archived'" : "= 'active'"}
     ORDER BY COALESCE(due_at, created_at) DESC`,
    ...(where === 'type = ?' ? [type] : []),
  );
  return rows.map(toItem);
}

export async function listByStatus(db: SQLiteDatabase, status: Exclude<ItemStatus, 'active'>): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    'SELECT * FROM items WHERE status = ? ORDER BY completed_at DESC LIMIT 200',
    status,
  );
  return rows.map(toItem);
}

export async function countByType(db: SQLiteDatabase): Promise<Partial<Record<ItemType | VirtualCollection, number>>> {
  const rows = await db.getAllAsync<{ type: ItemType | VirtualCollection; count: number }>(
    `SELECT type, COUNT(*) AS count FROM items WHERE status = 'active' AND type != 'place' GROUP BY type
     UNION ALL SELECT 'place', COUNT(*) FROM items WHERE status = 'active' AND ${PLACES_TO_TRY}
     UNION ALL SELECT 'travel-ideas', COUNT(*) FROM items WHERE status = 'active' AND ${VIRTUAL_COLLECTIONS['travel-ideas'].where}
     UNION ALL SELECT 'warranties', COUNT(*) FROM items WHERE status != 'archived' AND ${VIRTUAL_COLLECTIONS.warranties.where}`,
  );
  return Object.fromEntries(rows.map((r) => [r.type, r.count]));
}

/** Expired coupons are no use to anyone; move them out of the way (the plan's auto-archive). */
export async function archiveExpiredCoupons(db: SQLiteDatabase, now = new Date()): Promise<void> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  await db.runAsync(
    `UPDATE items SET status = 'archived', completed_at = ?, updated_at = ?
     WHERE type = 'coupon' AND status = 'active' AND due_at IS NOT NULL AND due_at < ?`,
    now.getTime(),
    now.getTime(),
    startOfToday,
  );
}

export type SearchFilters = {
  terms: string[];
  types?: ItemType[];
  dueBefore?: number;
  dueAfter?: number;
  includeDone?: boolean;
  dateField?: 'expiry' | 'return' | 'warranty';
};

export async function searchItems(db: SQLiteDatabase, filters: SearchFilters): Promise<Item[]> {
  const where: string[] = [filters.includeDone ? "i.status != 'archived'" : "i.status = 'active'"];
  const params: (string | number)[] = [];
  let from = 'items i';

  if (filters.terms.length) {
    from = 'items_fts f JOIN items i ON i.rowid = f.rowid';
    where.push('items_fts MATCH ?');
    // Prefix-match each word, quoted so user input can't inject FTS syntax.
    params.push(filters.terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' '));
  }
  if (filters.types?.length) {
    where.push(`i.type IN (${filters.types.map(() => '?').join(', ')})`);
    params.push(...filters.types);
  }
  const dateExpr = filters.dateField ? dateFieldExpression(filters.dateField) : 'i.due_at';
  const dateBound = (value: number) => (filters.dateField ? toLocalDateTime(new Date(value)) : value);
  if (filters.dueAfter !== undefined) {
    where.push(`${dateExpr} >= ?`);
    params.push(dateBound(filters.dueAfter));
  }
  if (filters.dueBefore !== undefined) {
    where.push(`${dateExpr} <= ?`);
    params.push(dateBound(filters.dueBefore));
  }

  const rows = await db.getAllAsync<ItemRow>(
    `SELECT i.* FROM ${from} WHERE ${where.join(' AND ')}
     ORDER BY ${filters.terms.length ? 'rank' : `COALESCE(${dateExpr}, i.created_at) ASC`} LIMIT 100`,
    ...params,
  );
  return rows.map(toItem);
}

function dateFieldExpression(field: NonNullable<SearchFilters['dateField']>): string {
  const paths = {
    expiry: ["'$.expiresOn'", "'$.warrantyUntil'"],
    return: ["'$.returnBy'"],
    warranty: ["'$.warrantyUntil'"],
  }[field];
  const values = paths.map((path) => `json_extract(i.fields, ${path})`);
  const coalesced = values.length === 1 ? values[0] : `COALESCE(${values.join(', ')})`;
  return `CASE WHEN ${coalesced} IS NULL THEN NULL WHEN length(${coalesced}) = 10 THEN ${coalesced} || 'T00:00' ELSE ${coalesced} END`;
}

export async function listAllItems(db: SQLiteDatabase): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>('SELECT * FROM items ORDER BY created_at');
  return rows.map(toItem);
}

/** Inserts an item from a backup as it was, keeping its id and dates. Reminders are scheduled separately. */
export async function insertRestoredItem(db: SQLiteDatabase, item: Item): Promise<void> {
  await db.runAsync(
    `INSERT INTO items (id, type, title, status, source_type, extracted_text, fields, attachments, confidence, due_at,
       reminder_mode, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?)`,
    item.id,
    item.type,
    item.title,
    item.status,
    item.sourceType,
    item.extractedText ?? '',
    JSON.stringify(item.fields ?? {}),
    JSON.stringify(item.attachments ?? []),
    item.confidence ?? 0,
    item.dueAt ?? null,
    item.createdAt ?? Date.now(),
    item.updatedAt ?? Date.now(),
    item.completedAt ?? null,
  );
}

export async function listSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
