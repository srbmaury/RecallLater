import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FieldEditor } from '@/components/field-editor';

jest.mock('@/components/date-time-picker', () => ({ useDateTimePicker: () => ({ pick: jest.fn(), element: null }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'ThemedText' }));
jest.mock('@/components/ui', () => ({ Button: 'Button', FieldList: () => null }));

it('shows a newly extracted amount when AI updates the review fields', async () => {
  let screen!: ReactTestRenderer;
  const onChange = jest.fn();
  await act(async () => { screen = create(<FieldEditor type="bill" fields={{ amount: 2840 }} onChange={onChange} />); });
  await act(async () => { screen.update(<FieldEditor type="bill" fields={{ amount: 3100 }} onChange={onChange} />); });
  expect(screen.root.find((node) => node.props.accessibilityLabel === 'Amount').props.value).toBe('3100');
  await act(async () => { screen.unmount(); });
});

it('keeps an amount draft when AI responds before the user leaves the input', async () => {
  let screen!: ReactTestRenderer;
  const onChange = jest.fn();
  await act(async () => { screen = create(<FieldEditor type="bill" fields={{ amount: 2840 }} onChange={onChange} />); });
  await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Amount').props.onChangeText('3100'); });
  await act(async () => { screen.update(<FieldEditor type="bill" fields={{ amount: 2900 }} onChange={onChange} />); });
  expect(screen.root.find((node) => node.props.accessibilityLabel === 'Amount').props.value).toBe('3100');
  await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Amount').props.onEndEditing(); });
  expect(onChange).toHaveBeenCalledWith({ amount: 3100, currency: 'INR' });
  await act(async () => { screen.unmount(); });
});

it('reports the typed amount before blur so Save and AI use the current correction', async () => {
  let screen!: ReactTestRenderer;
  const onChange = jest.fn();
  await act(async () => { screen = create(<FieldEditor type="bill" fields={{ amount: 2840 }} onChange={onChange} onDraftChange={onChange} />); });
  await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Amount').props.onChangeText('3100'); });
  expect(onChange).toHaveBeenCalledWith({ amount: 3100, currency: 'INR' });
  await act(async () => { screen.unmount(); });
});

it.each([
  ['12,50', 12.5],
  ['1.234,50', 1234.5],
  ['1,234.50', 1234.5],
  ['1,23,456', 123456],
])('preserves the amount represented by localized numeric input %s', async (text, amount) => {
  let screen!: ReactTestRenderer;
  const onChange = jest.fn();
  await act(async () => { screen = create(<FieldEditor type="bill" fields={{ amount: 10 }} onChange={onChange} onDraftChange={onChange} />); });
  await act(async () => { screen.root.find((node) => node.props.accessibilityLabel === 'Amount').props.onChangeText(text); });
  expect(onChange).toHaveBeenCalledWith({ amount, currency: 'INR' });
  await act(async () => { screen.unmount(); });
});
