import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { addDays, atTime, parseLocalDateTime, startOfDay } from '@/lib/dates';
import { archiveExpiredCoupons, getItem, getSetting, insertItem, setSetting, setStatus, updateItem } from '@/lib/db/items';
import { buildDigest, DIGEST_DAYS, DIGEST_SETTING, digestTimeOf } from '@/lib/digest';
import { summarize } from '@/lib/format';
import { keyDateOf } from '@/lib/parse';
import { suggestReminder } from '@/lib/parse/suggest';
import { nextOccurrence } from '@/lib/recurrence';
import { inAnHour, tomorrowMorning } from '@/lib/snooze';
import type { Item, ReminderMode } from '@/lib/types';

const CHANNEL_ID = 'reminders';
const CATEGORY_ID = 'item-reminder';
const ACTION_DONE = 'done';
const ACTION_HOUR = 'snooze-hour';
const ACTION_TOMORROW = 'snooze-tomorrow';
// Notifications scheduled before the snooze choices existed carry this action.
const ACTION_LATER = 'later';

const DAY = 86_400_000;
/**
 * "Remind until done" keeps this many future nudges queued per item and tops the
 * queue up on launch. iOS keeps at most 64 pending notifications per app.
 */
const UNTIL_DONE_QUEUE = 3;

export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  // Android shows at most three actions. Each opens the app so the change is applied
  // by JS even if the app was killed.
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: ACTION_DONE, buttonTitle: 'Done', options: { opensAppToForeground: true } },
    { identifier: ACTION_HOUR, buttonTitle: '1 hour', options: { opensAppToForeground: true } },
    { identifier: ACTION_TOMORROW, buttonTitle: 'Tomorrow', options: { opensAppToForeground: true } },
  ]);
}

/** Asks only when a reminder is actually being set, never on first launch. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function scheduleReminders(
  db: SQLiteDatabase,
  item: Item,
  mode: ReminderMode,
  firstFireAt: Date | null,
): Promise<void> {
  await cancelReminders(db, item.id);
  await db.runAsync('UPDATE items SET reminder_mode = ? WHERE id = ?', mode, item.id);
  if (mode === 'none' || !firstFireAt) return;
  if (!(await Notifications.getPermissionsAsync()).granted) {
    await db.runAsync('UPDATE items SET reminder_mode = \'none\' WHERE id = ?', item.id);
    return;
  }

  const count = mode === 'until_done' ? UNTIL_DONE_QUEUE : 1;
  const times = Array.from({ length: count }, (_, i) => new Date(firstFireAt.getTime() + i * DAY));
  try {
    await queue(db, item, times);
  } catch (error) {
    await cancelReminders(db, item.id).catch(console.warn);
    await db.runAsync("UPDATE items SET reminder_mode = 'none' WHERE id = ?", item.id).catch(console.warn);
    throw error;
  }
}

export async function cancelReminders(db: SQLiteDatabase, itemId: string): Promise<void> {
  const rows = await db.getAllAsync<{ notification_id: string | null }>(
    'SELECT notification_id FROM reminders WHERE item_id = ?',
    itemId,
  );
  await Promise.all(
    rows.filter((r) => r.notification_id).map((r) => Notifications.cancelScheduledNotificationAsync(r.notification_id!).catch(() => {})),
  );
  await db.runAsync('DELETE FROM reminders WHERE item_id = ?', itemId);
  await db.runAsync('UPDATE items SET next_reminder_at = NULL WHERE id = ?', itemId);
}

/** Persist completion and remove scheduled OS notifications together at the call site. */
export async function restoreItem(db: SQLiteDatabase, itemId: string): Promise<void> {
  await cancelReminders(db, itemId);
  await setStatus(db, itemId, 'active');
}

/** Marks an item done. A repeating one comes back as its next occurrence, which is returned. */
export async function completeItem(db: SQLiteDatabase, itemId: string, now = new Date()): Promise<Item | null> {
  // Read first: marking done clears the reminder mode the next occurrence inherits.
  const item = await getItem(db, itemId);
  await cancelReminders(db, itemId);
  await setStatus(db, itemId, 'done');
  const next = await (item ? createNextOccurrence(db, item, now) : Promise.resolve(null)).catch((error) => {
    console.warn('Could not create the next occurrence', error);
    return null;
  });
  refreshDigests(db).catch(console.warn);
  return next;
}

async function createNextOccurrence(db: SQLiteDatabase, item: Item, now: Date): Promise<Item | null> {
  const fields = nextOccurrence(item.fields, now);
  if (!fields) return null;
  // The repeat moves on to the new occurrence; the finished one stays as a record.
  const { repeat: _repeat, repeatDay: _repeatDay, ...finished } = item.fields;
  await updateItem(db, item.id, { fields: finished });
  const keyDate = keyDateOf(fields);
  const next = await insertItem(db, {
    type: item.type,
    title: item.title,
    sourceType: item.sourceType,
    extractedText: item.extractedText,
    fields,
    // Files belong to the occurrence they came with (this month's bill, not next month's).
    attachments: [],
    confidence: item.confidence,
    dueAt: keyDate ? parseLocalDateTime(keyDate).getTime() : null,
  });
  const suggestion = item.reminderMode === 'none' ? null : suggestReminder(item.type, fields, now);
  if (suggestion) await scheduleReminders(db, next, item.reminderMode, suggestion.fireAt);
  return next;
}

export async function archiveItem(db: SQLiteDatabase, itemId: string): Promise<void> {
  await cancelReminders(db, itemId);
  await setStatus(db, itemId, 'archived');
  refreshDigests(db).catch(console.warn);
}

const DIGEST_IDS = 'morning_digest_ids';

/**
 * Re-queues the morning digest for the next week from what's in the database now.
 * Previous digests are always cancelled first, so a changed day never shows stale news.
 */
export async function refreshDigests(db: SQLiteDatabase, now = new Date()): Promise<void> {
  const previous = JSON.parse((await getSetting(db, DIGEST_IDS)) ?? '[]') as string[];
  await Promise.all(previous.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));

  const ids: string[] = [];
  const time = digestTimeOf(await getSetting(db, DIGEST_SETTING));
  if (time && (await Notifications.getPermissionsAsync()).granted) {
    const rows = await db.getAllAsync<{ title: string; due_at: number | null }>(
      "SELECT title, due_at FROM items WHERE status = 'active' AND due_at IS NOT NULL",
    );
    const items = rows.map((r) => ({ title: r.title, dueAt: r.due_at }));
    const [hours, minutes] = time.split(':').map(Number);
    for (let offset = 0; offset < DIGEST_DAYS; offset++) {
      const day = addDays(startOfDay(now), offset);
      const fireAt = atTime(day, hours, minutes);
      const digest = buildDigest(items, day);
      if (fireAt.getTime() <= now.getTime() || !digest) continue;
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: { title: digest.title, body: digest.body, data: { digest: true } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL_ID },
        }),
      );
    }
  }
  await setSetting(db, DIGEST_IDS, JSON.stringify(ids));
}

/** Pushes the item's reminders to `until`, keeping its mode. */
export async function snooze(db: SQLiteDatabase, itemId: string, until: Date): Promise<void> {
  const item = await getItem(db, itemId);
  if (!item || item.status !== 'active') return;
  await scheduleReminders(db, item, item.reminderMode === 'none' ? 'once' : item.reminderMode, until);
  refreshDigests(db).catch(console.warn);
}

/**
 * Run on launch: forgets fired notifications and keeps "until done" items nagging
 * daily at the same time until they're completed.
 */
export async function reconcileReminders(db: SQLiteDatabase, now = Date.now()): Promise<void> {
  await archiveExpiredCoupons(db, new Date(now));
  // Anything no longer active (e.g. a coupon just archived) must not keep notifying.
  const stale = await db.getAllAsync<{ notification_id: string }>(
    `SELECT notification_id FROM reminders
     WHERE notification_id IS NOT NULL AND item_id IN (SELECT id FROM items WHERE status != 'active')`,
  );
  await Promise.all(stale.map((r) => Notifications.cancelScheduledNotificationAsync(r.notification_id)));
  await db.runAsync(`DELETE FROM reminders WHERE item_id IN (SELECT id FROM items WHERE status != 'active')`);
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const needingTopUp = await db.getAllAsync<{ id: string; last_fire: number | null; pending: number }>(
    `SELECT i.id, MAX(r.fire_at) AS last_fire, SUM(CASE WHEN r.fire_at > ? THEN 1 ELSE 0 END) AS pending
     FROM items i LEFT JOIN reminders r ON r.item_id = i.id
     WHERE i.status = 'active' AND i.reminder_mode = 'until_done'
     GROUP BY i.id
     HAVING pending < ?`,
    now,
    UNTIL_DONE_QUEUE,
  );
  await db.runAsync('DELETE FROM reminders WHERE fire_at <= ?', now);

  for (const row of needingTopUp) {
    const item = await getItem(db, row.id);
    if (!item || row.last_fire === null) continue;
    // Continue the daily cadence at the same time of day, skipping days the app wasn't opened.
    let next = row.last_fire + DAY;
    while (next <= now) next += DAY;
    const times: Date[] = [];
    for (let i = row.pending; i < UNTIL_DONE_QUEUE; i++, next += DAY) times.push(new Date(next));
    await queue(db, item, times);
  }
  await refreshNextReminder(db);
  await refreshDigests(db, new Date(now));
}

/** Development / E2E aid: re-queues the newest active item's reminder a few seconds from now. */
export async function fireNewestSoon(db: SQLiteDatabase, seconds = 5): Promise<string | null> {
  const row = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM items WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
  );
  const item = row && (await getItem(db, row.id));
  if (!item) return null;
  await scheduleReminders(db, item, 'once', new Date(Date.now() + seconds * 1000));
  return item.title;
}

export async function handleNotificationResponse(
  db: SQLiteDatabase,
  response: Notifications.NotificationResponse,
): Promise<string | null> {
  const itemId = response.notification.request.content.data?.itemId;
  if (typeof itemId !== 'string') return null;
  await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});

  switch (response.actionIdentifier) {
    case ACTION_DONE:
      await completeItem(db, itemId);
      return null;
    case ACTION_HOUR:
    case ACTION_LATER:
      await snooze(db, itemId, inAnHour(new Date()));
      return null;
    case ACTION_TOMORROW:
      await snooze(db, itemId, tomorrowMorning(new Date()));
      return null;
    default:
      return itemId;
  }
}

async function queue(db: SQLiteDatabase, item: Item, times: Date[]): Promise<void> {
  const body = summarize(item) || 'Tap to open';
  const scheduled: string[] = [];
  try {
    for (const fireAt of times) {
      if (fireAt.getTime() <= Date.now()) continue;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title,
          body,
          data: { itemId: item.id },
          categoryIdentifier: CATEGORY_ID,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: CHANNEL_ID,
        },
      });
      scheduled.push(notificationId);
      await db.runAsync(
        'INSERT INTO reminders (id, item_id, fire_at, notification_id) VALUES (?, ?, ?, ?)',
        Crypto.randomUUID(),
        item.id,
        fireAt.getTime(),
        notificationId,
      );
    }
  } catch (error) {
    await Promise.all(scheduled.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    throw error;
  }
  await refreshNextReminder(db, item.id);
}

async function refreshNextReminder(db: SQLiteDatabase, itemId?: string): Promise<void> {
  await db.runAsync(
    `UPDATE items SET next_reminder_at = (
       SELECT MIN(fire_at) FROM reminders WHERE reminders.item_id = items.id AND fire_at > ?
     ) ${itemId ? 'WHERE id = ?' : ''}`,
    ...(itemId ? [Date.now(), itemId] : [Date.now()]),
  );
}
