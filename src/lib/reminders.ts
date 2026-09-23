import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { getItem, setStatus } from '@/lib/db/items';
import { summarize } from '@/lib/format';
import type { Item, ReminderMode } from '@/lib/types';

const CHANNEL_ID = 'reminders';
const CATEGORY_ID = 'item-reminder';
export const ACTION_DONE = 'done';
export const ACTION_LATER = 'later';

const DAY = 86_400_000;
const LATER_DELAY = 3 * 3_600_000;
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
  // Both actions open the app so the change is applied by JS even if the app was killed.
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: ACTION_DONE, buttonTitle: 'Done', options: { opensAppToForeground: true } },
    { identifier: ACTION_LATER, buttonTitle: 'Later', options: { opensAppToForeground: true } },
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

  const count = mode === 'until_done' ? UNTIL_DONE_QUEUE : 1;
  const times = Array.from({ length: count }, (_, i) => new Date(firstFireAt.getTime() + i * DAY));
  await queue(db, item, times);
}

export async function cancelReminders(db: SQLiteDatabase, itemId: string): Promise<void> {
  const rows = await db.getAllAsync<{ notification_id: string | null }>(
    'SELECT notification_id FROM reminders WHERE item_id = ?',
    itemId,
  );
  await Promise.all(
    rows.filter((r) => r.notification_id).map((r) => Notifications.cancelScheduledNotificationAsync(r.notification_id!)),
  );
  await db.runAsync('DELETE FROM reminders WHERE item_id = ?', itemId);
  await db.runAsync('UPDATE items SET next_reminder_at = NULL WHERE id = ?', itemId);
}

export async function completeItem(db: SQLiteDatabase, itemId: string): Promise<void> {
  await cancelReminders(db, itemId);
  await setStatus(db, itemId, 'done');
}

export async function archiveItem(db: SQLiteDatabase, itemId: string): Promise<void> {
  await cancelReminders(db, itemId);
  await setStatus(db, itemId, 'archived');
}

/** Pushes the item's reminders to `until` (default: a few hours from now), keeping its mode. */
export async function snooze(db: SQLiteDatabase, itemId: string, until = new Date(Date.now() + LATER_DELAY)): Promise<void> {
  const item = await getItem(db, itemId);
  if (!item || item.status !== 'active') return;
  await scheduleReminders(db, item, item.reminderMode === 'none' ? 'once' : item.reminderMode, until);
}

/**
 * Run on launch: forgets fired notifications and keeps "until done" items nagging
 * daily at the same time until they're completed.
 */
export async function reconcileReminders(db: SQLiteDatabase, now = Date.now()): Promise<void> {
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
    case ACTION_LATER:
      await snooze(db, itemId);
      return null;
    default:
      return itemId;
  }
}

async function queue(db: SQLiteDatabase, item: Item, times: Date[]): Promise<void> {
  const body = summarize(item) || 'Tap to open';
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
    await db.runAsync(
      'INSERT INTO reminders (id, item_id, fire_at, notification_id) VALUES (?, ?, ?, ?)',
      Crypto.randomUUID(),
      item.id,
      fireAt.getTime(),
      notificationId,
    );
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
