import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import InboxScreen from '@/app/(tabs)/inbox';

let mockParams = { saved: 'same-item', outcome: 'Saved without a reminder.', savedAt: '1' };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, router: { push: jest.fn() } }));
jest.mock('@/hooks/use-db-query', () => ({ useDbQuery: () => ({ data: [] }) }));
jest.mock('@/lib/db/items', () => ({ listInbox: jest.fn() }));
jest.mock('@/components/add-sheet', () => ({ AddButton: () => null }));
jest.mock('@/components/item-row', () => ({ ItemRow: () => null }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'ThemedText' }));
jest.mock('@/components/ui', () => ({ Button: 'Button', Card: 'Card', EmptyState: () => null }));
jest.mock('@/components/screen', () => ({ TabList: ({ ListHeaderComponent }: { ListHeaderComponent: unknown }) => ListHeaderComponent }));

it('shows a new confirmation when the same item is saved again with the same outcome', async () => {
  let screen!: ReactTestRenderer;
  await act(async () => { screen = create(<InboxScreen />); });
  await act(async () => { screen.root.find((n) => n.props.label === 'Dismiss confirmation').props.onPress(); });
  expect(screen.root.findAll((n) => n.props.label === 'Edit saved item')).toHaveLength(0);
  mockParams = { ...mockParams, savedAt: '2' };
  await act(async () => { screen.update(<InboxScreen />); });
  expect(screen.root.findAll((n) => n.props.label === 'Edit saved item')).toHaveLength(1);
  await act(async () => { screen.unmount(); });
});
