import { Alert, ScrollView, StyleSheet } from 'react-native';

import { Chip, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatLocalDateTime } from '@/lib/dates';
import { keyDateOf } from '@/lib/parse';
import { REPEAT_LABELS } from '@/lib/recurrence';
import type { ExtractedFields, Item, Repeat } from '@/lib/types';

const CHOICES: { value: Repeat | undefined; label: string }[] = [
  { value: undefined, label: 'Never' },
  ...(Object.entries(REPEAT_LABELS) as [Repeat, string][]).map(([value, label]) => ({ value, label })),
];

/** "Repeats: Never · Every week · …". Only dated items can repeat. */
export function RepeatPicker({ fields, onChange }: { fields: ExtractedFields; onChange: (fields: ExtractedFields) => void }) {
  if (!fields.dueDate && !fields.startsAt) return null;
  return (
    <>
      <SectionHeader title="Repeats" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CHOICES.map((choice) => (
          <Chip
            key={choice.label}
            label={choice.label}
            selected={fields.repeat === choice.value}
            // A new rhythm starts from the current date, so drop any remembered day of the month.
            onPress={() => onChange({ ...fields, repeat: choice.value, repeatDay: undefined })}
          />
        ))}
      </ScrollView>
    </>
  );
}

/** Tells the user where a finished repeating item went. */
export function announceNextOccurrence(next: Item | null) {
  const date = next && keyDateOf(next.fields);
  if (date) Alert.alert('Next one added', `${next.title} is back for ${formatLocalDateTime(date)}.`);
}

const styles = StyleSheet.create({
  chips: {
    gap: Spacing.two,
  },
});
