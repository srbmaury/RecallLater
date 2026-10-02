import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, BackHandler } from 'react-native';

import ShareScreen from '@/app/share';
import { askAi } from '@/lib/ai/client';
import { deleteAttachments } from '@/lib/attachments';
import { findDuplicate, getItem, insertItem } from '@/lib/db/items';
import { scheduleReminders } from '@/lib/reminders';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, Stack: { Screen: () => null }, useLocalSearchParams: () => ({ source: 'add' }) }));
jest.mock('expo-sharing', () => ({ clearSharedPayloads: jest.fn() }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));
jest.mock('@/components/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const component = (name: string) => function TestComponent(props: object) { return React.createElement(name, props); };
  return Object.fromEntries(['Button', 'Card', 'Chip', 'EmptyState', 'SectionHeader'].map((name) => [name, component(name)]));
});
jest.mock('@/components/themed-text', () => ({ ThemedText: 'ThemedText' }));
jest.mock('@/components/field-editor', () => ({ FieldEditor: 'FieldEditor' }));
jest.mock('@/components/reminder-picker', () => ({ ReminderPicker: 'ReminderPicker' }));
jest.mock('@/components/repeat-picker', () => ({ RepeatPicker: 'RepeatPicker' }));
jest.mock('@/lib/calendar', () => ({ addToCalendar: jest.fn() }));
jest.mock('@/lib/db/provider', () => ({ useDatabase: () => 'db' }));
jest.mock('@/lib/db/items', () => ({
  getSetting: jest.fn(async () => 'ask'), listDueOn: jest.fn(async () => []),
  findDuplicate: jest.fn(async () => null), getItem: jest.fn(), insertItem: jest.fn(), updateItem: jest.fn(), setSetting: jest.fn(),
}));
jest.mock('@/lib/intake', () => ({ processPayloads: async () => ({ sourceType: 'image', text: 'Electricity Bill ₹2,840 Due 28 Sep 2030', attachments: ['bill.jpg'], barcodes: [], warnings: [] }) }));
jest.mock('@/lib/pending', () => ({ getPendingPayloads: () => [{ shareType: 'text', value: 'bill' }], clearPendingPayloads: jest.fn() }));
jest.mock('@/lib/attachments', () => ({ attachmentFile: () => ({ uri: 'file:///bill.jpg' }), deleteAttachments: jest.fn(), isPdf: () => false }));
jest.mock('@/lib/ai/client', () => ({ AI_SETTING: 'ai_understanding', aiModeOf: () => 'ask', isAiConfigured: () => true, askAi: jest.fn() }));
jest.mock('@/lib/corrections', () => ({ recordCorrections: jest.fn(async () => {}) }));
jest.mock('@/lib/reminders', () => ({ ensureNotificationPermission: jest.fn(async () => true), refreshSummaries: jest.fn(async () => {}), scheduleReminders: jest.fn(async (_db: unknown, _item: unknown, _mode: unknown, fireAt: Date | null) => fireAt) }));

let screen: ReactTestRenderer;
const saved = { id: 'saved', attachments: ['bill.jpg'] };
const press = (label: string) => screen.root.findAll((node) => node.props.label === label && typeof node.props.onPress === 'function')[0].props.onPress();
const field = (name: string) => screen.root.find((node) => node.type === name);
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(findDuplicate).mockResolvedValue(null);
  jest.mocked(insertItem).mockResolvedValue(saved as never);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => { screen = create(<ShareScreen />); });
  await flush();
});
afterEach(async () => { await act(async () => screen.unmount()); jest.restoreAllMocks(); });

it('does not discard copied attachments when Android Back is pressed during saving', async () => {
  let finish!: (value: never) => void;
  jest.mocked(insertItem).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const listener = jest.spyOn(BackHandler, 'addEventListener');
  await act(async () => { press(field('ReminderPicker').props.value.fireAt ? 'Save & remind' : 'Save only'); });
  const back = listener.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)![1];
  await act(async () => { expect(back(undefined as never)).toBe(true); });
  expect(deleteAttachments).not.toHaveBeenCalled();
  await act(async () => { finish(saved as never); });
});

it('keeps corrections made while an AI request is pending, including explicit field removal', async () => {
  let finish!: (value: never) => void;
  jest.mocked(askAi).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { press('More options'); });
  await act(async () => { press('✨ Improve with AI'); });
  const choices = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => { choices.find((choice) => choice.text === 'Send once')!.onPress!(); });
  await act(async () => {
    field('TextInput').props.onChangeText('My corrected bill');
    field('FieldEditor').props.onChange({ amount: 3100, currency: 'INR' });
    field('ReminderPicker').props.onChange({ mode: 'none', fireAt: null });
  });
  await act(async () => { finish({ type: 'bill', title: 'Electricity Bill', confidence: 0.9, amount: 2840, dueDate: '2030-09-28' } as never); });
  expect(field('TextInput').props.value).toBe('My corrected bill');
  expect(field('FieldEditor').props.fields).toMatchObject({ amount: 3100 });
  expect(field('FieldEditor').props.fields.dueDate).toBeUndefined();
  expect(field('ReminderPicker').props.value).toEqual({ mode: 'none', fireAt: null });
  await act(async () => { press('Undo'); });
  expect(field('TextInput').props.value).toBe('My corrected bill');
});

it('cancels existing reminders when updating a duplicate with No reminder selected', async () => {
  jest.mocked(findDuplicate).mockResolvedValue(saved as never);
  jest.mocked(getItem).mockResolvedValue(saved as never);
  await act(async () => { field('ReminderPicker').props.onChange({ mode: 'none', fireAt: null }); });
  await act(async () => { press(field('ReminderPicker').props.value.fireAt ? 'Save & remind' : 'Save only'); });
  const choices = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => { choices.find((choice) => choice.text === 'Update it')!.onPress!(); });
  expect(scheduleReminders).toHaveBeenCalledWith('db', saved, 'none', null);
});

it('preserves a manually selected type while still allowing AI to improve untouched fields', async () => {
  let finish!: (value: never) => void;
  jest.mocked(askAi).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { press('More options'); });
  await act(async () => { press('✨ Improve with AI'); });
  const choices = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => { choices.find((choice) => choice.text === 'Send once')!.onPress!(); });
  const chip = screen.root.findAll((node) => node.props.label?.includes('Receipt') && typeof node.props.onPress === 'function')[0];
  await act(async () => { chip.props.onPress(); });
  await act(async () => { finish({ type: 'bill', title: 'Electricity Bill', confidence: 0.9 } as never); });
  expect(field('FieldEditor').props.type).toBe('receipt');
  expect(screen.root.findAll((node) => node.props.label === 'Undo')).not.toHaveLength(0);
});

it('resets correction markers along with fields when the user changes type during AI', async () => {
  let finish!: (value: never) => void;
  jest.mocked(askAi).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { press('More options'); });
  await act(async () => { press('✨ Improve with AI'); });
  const choices = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => { choices.find((choice) => choice.text === 'Send once')!.onPress!(); });
  await act(async () => { field('FieldEditor').props.onChange({ amount: 3100, currency: 'INR' }); });
  const chip = screen.root.findAll((node) => node.props.label?.includes('Receipt') && typeof node.props.onPress === 'function')[0];
  await act(async () => { chip.props.onPress(); });
  await act(async () => { finish({ type: 'bill', title: 'Electricity Bill', confidence: 0.9, amount: 2840 } as never); });
  expect(field('FieldEditor').props.fields.amount).toBe(2840);
});

it('keeps the type of fields being corrected when a delayed AI reply proposes another type', async () => {
  let finish!: (value: never) => void;
  jest.mocked(askAi).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { press('More options'); });
  await act(async () => { press('✨ Improve with AI'); });
  const choices = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => { choices.find((choice) => choice.text === 'Send once')!.onPress!(); });
  await act(async () => { field('FieldEditor').props.onChange({ amount: 3100, currency: 'INR' }); });
  await act(async () => { finish({ type: 'receipt', title: 'Electricity Bill', confidence: 0.9, amount: 2840 } as never); });
  expect(field('FieldEditor').props.type).toBe('bill');
  expect(field('FieldEditor').props.fields.amount).toBe(3100);
});

it('asks before discarding an edited review, and keeps the draft when canceled', async () => {
  await act(async () => { field('TextInput').props.onChangeText('Corrected title'); });
  await act(async () => { press('Discard'); });
  expect(deleteAttachments).not.toHaveBeenCalled();
  const dialog = jest.mocked(Alert.alert).mock.calls.at(-1)!;
  expect(dialog[0]).toBe('Discard your changes?');
  expect(dialog[2]!.some((choice) => choice.text === 'Keep editing')).toBe(true);
  await act(async () => { dialog[2]!.find((choice) => choice.text === 'Discard')!.onPress!(); });
  expect(deleteAttachments).toHaveBeenCalledWith(['bill.jpg']);
});

it('starts with advanced review choices collapsed and an explicit save outcome', () => {
  expect(screen.root.findAll((node) => node.props.label === 'More options')).not.toHaveLength(0);
  expect(screen.root.findAll((node) => node.props.label === '✨ Improve with AI')).toHaveLength(0);
  expect(screen.root.findAll((node) => node.props.label === 'Save & remind')).not.toHaveLength(0);
});

it('confirms saving without a reminder in the inbox with a link to edit the item', async () => {
  await act(async () => { field('ReminderPicker').props.onChange({ mode: 'none', fireAt: null }); });
  await act(async () => { press('Save only'); });
  const { router } = jest.requireMock('expo-router');
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/inbox', params: { saved: 'saved', outcome: 'Saved without a reminder.', savedAt: expect.any(String) } });
});

it('applies an AI reply deferred by the save dialog after canceling the duplicate update', async () => {
  let finish!: (value: never) => void;
  jest.mocked(findDuplicate).mockResolvedValue(saved as never);
  jest.mocked(askAi).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { press('More options'); });
  await act(async () => { press('✨ Improve with AI'); });
  await act(async () => { jest.mocked(Alert.alert).mock.calls.at(-1)![2]!.find((choice) => choice.text === 'Send once')!.onPress!(); });
  await act(async () => { press('Save & remind'); });
  const cancel = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!.find((choice) => choice.text === 'Cancel')!;
  await act(async () => { finish({ type: 'bill', title: 'Improved bill', confidence: 0.9, amount: 3000 } as never); });
  await act(async () => { cancel.onPress!(); });
  expect(screen.root.findAll((node) => node.props.children === 'Improving with AI…')).toHaveLength(0);
  expect(screen.root.findAll((node) => node.props.label === 'Undo')).not.toHaveLength(0);
});

it('clears an old duplicate reminder when notification permission is denied', async () => {
  const { ensureNotificationPermission } = jest.requireMock('@/lib/reminders');
  ensureNotificationPermission.mockResolvedValueOnce(false);
  jest.mocked(findDuplicate).mockResolvedValue(saved as never);
  jest.mocked(getItem).mockResolvedValue(saved as never);
  await act(async () => { press('Save & remind'); });
  await act(async () => { jest.mocked(Alert.alert).mock.calls.at(-1)![2]!.find((choice) => choice.text === 'Update it')!.onPress!(); });
  expect(scheduleReminders).toHaveBeenCalledWith('db', saved, 'none', null);
});

it('does not promise a reminder when permission changes during scheduling', async () => {
  jest.mocked(scheduleReminders).mockResolvedValueOnce(null);
  await act(async () => { press('Save & remind'); });
  const { router } = jest.requireMock('expo-router');
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/inbox', params: { saved: 'saved', outcome: 'Saved without a reminder.', savedAt: expect.any(String) } });
});
