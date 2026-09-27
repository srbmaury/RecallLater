import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { shareAsync } from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { attachmentFile } from '@/lib/attachments';
import { BACKUP_EXTENSION, buildBackup, itemsToRestore, parseBackup, resumeReminderAt } from '@/lib/backup';
import { toDateKey } from '@/lib/dates';
import { getItem, insertRestoredItem, listAllItems, listSettings, setSetting } from '@/lib/db/items';
import { refreshDigests, scheduleReminders } from '@/lib/reminders';

/**
 * Writes everything to one file and opens the share sheet, so the person decides where
 * it goes (Files, a USB drive, their own cloud). Nothing is uploaded by the app.
 */
export async function exportBackup(db: SQLiteDatabase, now = new Date()): Promise<void> {
  const items = await listAllItems(db);
  const files: Record<string, string> = {};
  for (const name of items.flatMap((item) => item.attachments)) {
    const file = attachmentFile(name);
    if (file.exists) files[name] = await file.base64();
  }
  const backup = buildBackup(items, await listSettings(db), files, now);

  // Only the newest export is kept in the cache; older ones would be stale copies of private data.
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.endsWith(BACKUP_EXTENSION)) entry.delete();
  }
  const file = new File(Paths.cache, `RecallLater-${toDateKey(now)}${BACKUP_EXTENSION}`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(backup));
  await shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Save your backup' });
}

export type RestoreResult = { added: number; skipped: number };

/** Lets the person pick a backup and merges it in. Returns null if they cancelled. */
export async function importBackup(db: SQLiteDatabase, now = new Date()): Promise<RestoreResult | null> {
  const picked = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const source = new File(picked.assets[0].uri);
  try {
    const backup = parseBackup(await source.text());
    const toAdd = itemsToRestore(backup, await listAllItems(db));

    await db.withTransactionAsync(async () => {
      for (const item of toAdd) {
        const attachments = item.attachments.filter((name) => {
          const target = attachmentFile(name);
          if (target.exists) return true;
          const contents = backup.files[name];
          if (!contents) return false;
          target.create();
          target.write(contents, { encoding: 'base64' });
          return true;
        });
        await insertRestoredItem(db, { ...item, attachments });
      }
    });

    const current = await listSettings(db);
    for (const [key, value] of Object.entries(backup.settings)) {
      if (!(key in current)) await setSetting(db, key, value);
    }

    if ((await Notifications.getPermissionsAsync()).granted) {
      for (const item of toAdd) {
        const fireAt = resumeReminderAt(item, now);
        const restored = fireAt && (await getItem(db, item.id));
        if (restored) await scheduleReminders(db, restored, item.reminderMode, fireAt).catch(console.warn);
      }
    }
    await refreshDigests(db, now);
    return { added: toAdd.length, skipped: backup.items.length - toAdd.length };
  } finally {
    if (source.exists) source.delete();
  }
}
