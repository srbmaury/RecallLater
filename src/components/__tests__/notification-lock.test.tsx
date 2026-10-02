import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import RootLayout from '@/app/_layout';
import { unlock } from '@/lib/app-lock';
import { getSetting } from '@/lib/db/items';
import { handleNotificationResponse } from '@/lib/reminders';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const passthrough = ({ children }: { children: import('react').ReactNode }) => React.createElement(React.Fragment, null, children);
  return { ThemeProvider: passthrough, Stack: Object.assign(passthrough, { Screen: () => null }), router: { push: jest.fn(), navigate: jest.fn() }, usePathname: () => '/' };
});
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({ getLastNotificationResponse: jest.fn(), clearLastNotificationResponse: jest.fn(), addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('@/lib/db/provider', () => ({ DatabaseProvider: ({ children }: { children: unknown }) => children, useDatabase: () => 'db' }));
jest.mock('@/lib/db/items', () => ({ getSetting: jest.fn() }));
jest.mock('@/lib/app-lock', () => ({ ...jest.requireActual('@/lib/app-lock'), unlock: jest.fn() }));
jest.mock('expo-local-authentication', () => ({}));
jest.mock('@/lib/reminders', () => ({ handleNotificationResponse: jest.fn(async () => null), reconcileReminders: jest.fn(async () => {}), refreshSummaries: jest.fn(async () => {}), setupNotifications: jest.fn(async () => {}) }));
jest.mock('@/components/ui', () => ({ Button: 'Button' }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'ThemedText' }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));

let screen: ReactTestRenderer;
const response = { actionIdentifier: 'done', notification: { request: { identifier: 'n1', content: { data: { itemId: 'bill' } } } } } as unknown as Notifications.NotificationResponse;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  jest.mocked(getSetting).mockImplementation(async (_db, key) => key === 'app_lock' ? 'on' : 'yes');
  jest.mocked(unlock).mockResolvedValue(false);
  jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(response);
});
afterEach(async () => { await act(async () => screen.unmount()); jest.restoreAllMocks(); });

it('holds a cold-start Done action after authentication is cancelled, then handles it once after successful unlock', async () => {
  await act(async () => { screen = create(<RootLayout />); });
  expect(handleNotificationResponse).not.toHaveBeenCalled();
  jest.mocked(unlock).mockResolvedValue(true);
  await act(async () => { screen.root.find((node) => node.props.label === 'Unlock').props.onPress(); });
  expect(handleNotificationResponse).toHaveBeenCalledTimes(1);
  expect(handleNotificationResponse).toHaveBeenCalledWith('db', response);
});

it('allows notification actions when the app lock is off', async () => {
  jest.mocked(getSetting).mockResolvedValue('off');
  await act(async () => { screen = create(<RootLayout />); });
  expect(handleNotificationResponse).toHaveBeenCalledWith('db', response);
  expect(unlock).not.toHaveBeenCalled();
});

it('holds a warm-start action after the relock interval until authentication succeeds', async () => {
  jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(null);
  jest.mocked(unlock).mockResolvedValueOnce(true).mockResolvedValue(false);
  await act(async () => { screen = create(<RootLayout />); });
  const listeners = jest.mocked(AppState.addEventListener).mock.calls.map(([, callback]) => callback);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(100_000);
  await act(async () => { for (const callback of listeners) callback('background'); });
  clock.mockReturnValue(140_000);
  await act(async () => { for (const callback of listeners) callback('active'); });
  const receive = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => { receive(response); });
  expect(handleNotificationResponse).not.toHaveBeenCalled();
  jest.mocked(unlock).mockResolvedValue(true);
  await act(async () => { screen.root.find((node) => node.props.label === 'Unlock').props.onPress(); });
  expect(handleNotificationResponse).toHaveBeenCalledTimes(1);
});
