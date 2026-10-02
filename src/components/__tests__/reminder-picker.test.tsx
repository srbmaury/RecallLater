import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ReminderPicker } from '@/components/reminder-picker';

jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'ThemedText' }));
jest.mock('@/components/ui', () => ({ Chip: 'Chip', Button: 'Button' }));
jest.mock('@/components/date-time-picker', () => ({ useDateTimePicker: () => ({ pick: jest.fn(), element: null }) }));

it('keeps save-only beside the suggested reminder while hiding advanced presets', async () => {
  let screen!: ReactTestRenderer;
  const onChange = jest.fn();
  const fireAt = new Date(2030, 8, 27, 19);
  await act(async () => { screen = create(<ReminderPicker compact value={{ mode: 'until_done', fireAt }} onChange={onChange} suggestion={{ mode: 'until_done', fireAt }} />); });
  expect(screen.root.findAll((n) => n.props.label === 'Tomorrow 9 AM')).toHaveLength(0);
  const saveOnly = screen.root.find((n) => n.props.label === 'No reminder');
  await act(async () => { saveOnly.props.onPress(); });
  expect(onChange).toHaveBeenCalledWith({ mode: 'none', fireAt: null });
  await act(async () => { screen.root.find((n) => n.props.label === 'Change reminder…').props.onPress(); });
  expect(screen.root.findAll((n) => n.props.label === 'Tomorrow 9 AM')).not.toHaveLength(0);
  expect(screen.root.findAll((n) => n.props.label === 'No reminder')).toHaveLength(1);
  await act(async () => { screen.unmount(); });
});
