import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { scheduleReminders } from '@/lib/reminders';
import type { Item } from '@/lib/types';

jest.mock('expo-notifications', () => ({
  getNotificationChannelAsync: jest.fn(async () => ({ importance: 4 })),
  setNotificationChannelAsync: jest.fn(async () => ({ importance: 4 })),
  AndroidImportance: { NONE: 0, HIGH: 4 },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'reminder-id' }));
jest.mock('@/widgets/today', () => ({ updateTodayWidget: jest.fn() }));
const NOW = new Date(2026, 8, 23, 10);
const item = { id: 'bill', type: 'bill', title: 'Bill', fields: {}, attachments: [] } as unknown as Item;
const db = { getAllAsync: jest.fn(async () => []), runAsync: jest.fn(async () => {}) };

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(NOW); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('returns no scheduled time for an elapsed one-time reminder', async () => {
  expect(await scheduleReminders(db as never, item, 'once', new Date(NOW.getTime() - 60_000))).toBeNull();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('returns the first future queued time when the first daily reminder has elapsed', async () => {
  const first = new Date(NOW.getTime() - 60_000);
  expect(await scheduleReminders(db as never, item, 'until_done', first)).toEqual(new Date(first.getTime() + 86_400_000));
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});

it('does not queue reminders when the Android channel is blocked despite app permission', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValueOnce({ importance: 0 } as never);
  expect(await scheduleReminders(db as never, item, 'once', new Date(NOW.getTime() + 60_000))).toBeNull();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('still queues reminders on Android when the channel is enabled', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  const future = new Date(NOW.getTime() + 60_000);
  expect(await scheduleReminders(db as never, item, 'once', future)).toEqual(future);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

it('keeps reminders working on Android versions before notification channels', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(25);
  const future = new Date(NOW.getTime() + 60_000);
  expect(await scheduleReminders(db as never, item, 'once', future)).toEqual(future);
  expect(Notifications.getNotificationChannelAsync).not.toHaveBeenCalled();
});
