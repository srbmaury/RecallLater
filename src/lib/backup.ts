import { type Candidate, isDuplicate } from '@/lib/duplicates';
import { ITEM_TYPES, type Item } from '@/lib/types';
import { assertAttachmentName } from './attachment-name';

export const BACKUP_EXTENSION = '.recalllater';
const BACKUP_VERSION = 1;
/** Preferences worth carrying to a new phone. Scheduling bookkeeping is rebuilt instead. */
const PORTABLE_SETTINGS = ['ai_understanding', 'morning_digest', 'welcomed'];

export type Backup = {
  app: 'recalllater';
  version: number;
  exportedAt: number;
  items: Item[];
  settings: Record<string, string>;
  /** Attachment file name → base64 contents. */
  files: Record<string, string>;
};

export function buildBackup(items: Item[], settings: Record<string, string>, files: Record<string, string>, now: Date): Backup {
  const portable = Object.fromEntries(Object.entries(settings).filter(([key]) => PORTABLE_SETTINGS.includes(key)));
  return { app: 'recalllater', version: BACKUP_VERSION, exportedAt: now.getTime(), items, settings: portable, files };
}

/** Reads a backup file's text, with errors a person can act on. */
export function parseBackup(text: string): Backup {
  let data: Partial<Backup>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This isn’t a RecallLater backup.');
  }
  if (data?.app !== 'recalllater' || !Array.isArray(data.items)) throw new Error('This isn’t a RecallLater backup.');
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of RecallLater. Update the app, then try again.');
  }
  // Validate the entire backup before restore can touch the filesystem, including
  // files not referenced by an item. Never allow names to escape attachments/.
  if (data.files !== undefined && (!data.files || typeof data.files !== 'object' || Array.isArray(data.files))) {
    throw new Error('Invalid attachment files in backup.');
  }
  for (const [name, contents] of Object.entries(data.files ?? {})) {
    assertAttachmentName(name);
    if (typeof contents !== 'string') throw new Error('Invalid attachment contents in backup.');
  }
  for (const item of data.items) {
    if (item?.attachments === undefined) continue;
    if (!Array.isArray(item.attachments)) throw new Error('Invalid attachment list in backup.');
    item.attachments.forEach(assertAttachmentName);
  }
  const items = data.items.filter(
    (item): item is Item =>
      typeof item?.id === 'string' && typeof item.title === 'string' && (ITEM_TYPES as readonly string[]).includes(item.type),
  );
  return {
    app: 'recalllater',
    version: data.version,
    exportedAt: Number(data.exportedAt) || 0,
    items,
    settings: Object.fromEntries(
      Object.entries(data.settings ?? {}).filter(([key, value]) => PORTABLE_SETTINGS.includes(key) && typeof value === 'string'),
    ),
    files: data.files ?? {},
  };
}

/**
 * What to add from a backup: items this phone doesn't have yet. The same id means it was
 * already restored; the same bill or code means it was shared again on this phone.
 */
export function itemsToRestore(backup: Backup, existing: Item[]): Item[] {
  const ids = new Set(existing.map((item) => item.id));
  const active = existing.filter((item) => item.status === 'active');
  return backup.items.filter(
    (item) => !ids.has(item.id) && !(item.status === 'active' && active.some((other) => isDuplicate(item as Candidate, other))),
  );
}

const DAY = 86_400_000;

/**
 * When a restored item's reminder should fire next. A one-off reminder that already
 * passed is dropped; "until done" carries on at the same time of day.
 */
export function resumeReminderAt(item: Item, now: Date): Date | null {
  if (item.status !== 'active' || item.reminderMode === 'none' || item.nextReminderAt === null) return null;
  if (item.nextReminderAt > now.getTime()) return new Date(item.nextReminderAt);
  if (item.reminderMode === 'once') return null;
  let next = item.nextReminderAt;
  while (next <= now.getTime()) next += DAY;
  return new Date(next);
}
