import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useDateTimePicker } from '@/components/date-time-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, FieldList } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, atTime, formatLocalDateTime, hasTime, parseLocalDateTime, toLocalDateTime } from '@/lib/dates';
import { fieldRows } from '@/lib/format';
import type { ExtractedFields, ItemType } from '@/lib/types';

type DateKey = 'dueDate' | 'startsAt' | 'purchasedOn' | 'returnBy' | 'expiresOn' | 'warrantyUntil';
type EditableKey = 'amount' | DateKey;

/** The facts a user most often needs to correct, per type. */
const EDITABLE: Record<ItemType, EditableKey[]> = {
  bill: ['amount', 'dueDate'],
  task: ['dueDate'],
  event: ['startsAt'],
  travel: ['startsAt'],
  receipt: ['amount', 'purchasedOn', 'returnBy', 'warrantyUntil'],
  purchase: ['amount', 'expiresOn'],
  job: ['dueDate'],
  coupon: ['expiresOn'],
  place: [],
  book: [],
  watch: [],
  recipe: [],
  generic: ['dueDate'],
};

const DATE_FIELDS: Record<DateKey, { label: string; withTime: boolean }> = {
  dueDate: { label: 'Due', withTime: false },
  startsAt: { label: 'When', withTime: true },
  purchasedOn: { label: 'Purchased', withTime: false },
  returnBy: { label: 'Return by', withTime: false },
  expiresOn: { label: 'Expires', withTime: false },
  warrantyUntil: { label: 'Warranty till', withTime: false },
};

/**
 * Extracted fields with the important ones editable, so a misread amount or date is
 * one tap to fix instead of a reason to distrust the app.
 */
export function FieldEditor({
  type,
  fields,
  onChange,
}: {
  type: ItemType;
  fields: ExtractedFields;
  onChange: (fields: ExtractedFields) => void;
}) {
  const { pick, element } = useDateTimePicker();
  const editable = EDITABLE[type];

  const readOnly: ExtractedFields = { ...fields };
  for (const key of editable) delete readOnly[key];
  if (editable.includes('amount')) delete readOnly.currency;

  const editDate = async (key: DateKey) => {
    const { withTime } = DATE_FIELDS[key];
    const current = fields[key];
    const initial = current ? parseLocalDateTime(current) : atTime(addDays(new Date(), 1), 9);
    const chosen = await pick(initial, withTime ? 'datetime' : 'date');
    if (!chosen) return;
    // A date-only field keeps any time the document printed ("due 28 Sep, 11:59 PM").
    const keepPrintedTime = !withTime && current !== undefined && hasTime(current);
    const value = keepPrintedTime
      ? toLocalDateTime(atTime(chosen, initial.getHours(), initial.getMinutes()))
      : toLocalDateTime(chosen, withTime);
    onChange({ ...fields, [key]: value });
  };

  const clear = (key: EditableKey) => {
    const next = { ...fields };
    delete next[key];
    if (key === 'amount') delete next.currency;
    onChange(next);
  };

  return (
    <View style={styles.list}>
      {editable.map((key) =>
        key === 'amount' ? (
          <AmountRow
            key={key}
            amount={fields.amount}
            currency={fields.currency ?? 'INR'}
            onChange={(amount) =>
              amount === undefined ? clear('amount') : onChange({ ...fields, amount, currency: fields.currency ?? 'INR' })
            }
          />
        ) : (
          <EditableRow
            key={key}
            label={DATE_FIELDS[key].label}
            value={fields[key] ? formatLocalDateTime(fields[key]!) : undefined}
            placeholder={`Add ${DATE_FIELDS[key].label.toLowerCase()} date`}
            onPress={() => editDate(key)}
            onClear={fields[key] ? () => clear(key) : undefined}
          />
        ),
      )}
      <FieldList rows={fieldRows(readOnly, type)} />
      {element}
    </View>
  );
}

function EditableRow({
  label,
  value,
  placeholder,
  onPress,
  onClear,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  onClear?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? 'not set'}. Change`}
        onPress={onPress}
        style={styles.value}>
        <ThemedText type="smallBold" style={{ color: value ? theme.text : theme.tint }}>
          {value ?? placeholder}
        </ThemedText>
        {value ? (
          <ThemedText type="small" style={{ color: theme.tint }}>
            Change
          </ThemedText>
        ) : null}
      </Pressable>
      {onClear ? <Button label="✕" variant="plain" size="small" onPress={onClear} style={styles.clear} /> : null}
    </View>
  );
}

function AmountRow({
  amount,
  currency,
  onChange,
}: {
  amount?: number;
  currency: string;
  onChange: (amount: number | undefined) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(amount !== undefined ? String(amount) : '');
  const commit = () => {
    const parsed = Number(text.replace(/[^\d.]/g, ''));
    onChange(text.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
  };
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Amount
      </ThemedText>
      <ThemedText type="smallBold">{currencySymbol(currency)}</ThemedText>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={commit}
        keyboardType="decimal-pad"
        placeholder="Add amount"
        placeholderTextColor={theme.tint}
        accessibilityLabel="Amount"
        style={[styles.value, styles.amountInput, { color: theme.text, marginLeft: -Spacing.two }]}
      />
    </View>
  );
}

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en-IN', { style: 'currency', currency }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 32,
  },
  label: {
    width: 84,
  },
  value: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountInput: {
    fontSize: 14,
    fontWeight: 600,
    padding: 0,
  },
  clear: {
    minHeight: 28,
    paddingHorizontal: Spacing.two,
  },
});
