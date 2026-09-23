import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { endOfDay } from '@/lib/dates';
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

export type NewItem = Pick<Item, 'type' | 'title' | 'sourceType' | 'extractedText' | 'fields' | 'attachments' | 'confidence' | 'dueAt'>;

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

export async function getItem(db: SQLiteDatabase, id: string): Promise<Item | null> {
  const row = await db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ?', id);
  return row ? toItem(row) : null;
}

export async function updateItem(
  db: SQLiteDatabase,
  id: string,
  changes: Partial<Pick<Item, 'type' | 'title' | 'fields' | 'dueAt'>>,
): Promise<void> {
  const columns: [string, string | number | null][] = [];
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
  await db.runAsync(
    'UPDATE items SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
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
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items
     WHERE status = 'active'
       AND ((due_at IS NOT NULL AND due_at <= ?) OR (next_reminder_at IS NOT NULL AND next_reminder_at <= ?))
     ORDER BY COALESCE(MIN(due_at, next_reminder_at), due_at, next_reminder_at) ASC`,
    tonight,
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

export async function listInbox(db: SQLiteDatabase): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items WHERE status = 'active' ORDER BY created_at DESC LIMIT 200`,
  );
  return rows.map(toItem);
}

export async function listByType(db: SQLiteDatabase, type: ItemType, includeDone = false): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items WHERE type = ? AND status ${includeDone ? "!= 'archived'" : "= 'active'"}
     ORDER BY status = 'active' DESC, COALESCE(due_at, created_at) DESC`,
    type,
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

export async function countByType(db: SQLiteDatabase): Promise<Partial<Record<ItemType, number>>> {
  const rows = await db.getAllAsync<{ type: ItemType; count: number }>(
    `SELECT type, COUNT(*) AS count FROM items WHERE status = 'active' GROUP BY type`,
  );
  return Object.fromEntries(rows.map((r) => [r.type, r.count]));
}

export type SearchFilters = {
  terms: string[];
  types?: ItemType[];
  dueBefore?: number;
  dueAfter?: number;
  includeDone?: boolean;
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
  if (filters.dueAfter !== undefined) {
    where.push('i.due_at >= ?');
    params.push(filters.dueAfter);
  }
  if (filters.dueBefore !== undefined) {
    where.push('i.due_at <= ?');
    params.push(filters.dueBefore);
  }

  const rows = await db.getAllAsync<ItemRow>(
    `SELECT i.* FROM ${from} WHERE ${where.join(' AND ')}
     ORDER BY ${filters.terms.length ? 'rank' : 'COALESCE(i.due_at, i.created_at) ASC'} LIMIT 100`,
    ...params,
  );
  return rows.map(toItem);
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
