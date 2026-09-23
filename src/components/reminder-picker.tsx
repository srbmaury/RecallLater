import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addDays, atTime } from '@/lib/dates';
import { formatReminder } from '@/lib/format';
import type { ReminderSuggestion } from '@/lib/parse';
import type { ReminderMode } from '@/lib/types';

export type ReminderChoice = { mode: ReminderMode; fireAt: Date | null };

type Preset = { key: string; label: string; fireAt: Date | null };

export function ReminderPicker({
  value,
  onChange,
  suggestion,
}: {
  value: ReminderChoice;
  onChange: (value: ReminderChoice) => void;
  suggestion?: ReminderSuggestion | null;
}) {
  const presets = useMemo(() => buildPresets(suggestion), [suggestion]);
  const selectedKey =
    presets.find((p) => (p.fireAt === null ? value.fireAt === null : p.fireAt.getTime() === value.fireAt?.getTime()))?.key ??
    'custom';

  const pick = (preset: Preset) => {
    if (!preset.fireAt) return onChange({ mode: 'none', fireAt: null });
    const mode = value.mode === 'none' ? (suggestion?.mode ?? 'once') : value.mode;
    onChange({ mode, fireAt: preset.fireAt });
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {presets.map((preset) => (
          <Chip key={preset.key} label={preset.label} selected={selectedKey === preset.key} onPress={() => pick(preset)} />
        ))}
        {selectedKey === 'custom' && value.fireAt ? <Chip label={formatReminder(value.fireAt)} selected onPress={() => {}} /> : null}
      </ScrollView>
      {value.fireAt ? (
        <View style={styles.row}>
          <Chip label="Remind once" selected={value.mode === 'once'} onPress={() => onChange({ ...value, mode: 'once' })} />
          <Chip
            label="Until done"
            selected={value.mode === 'until_done'}
            onPress={() => onChange({ ...value, mode: 'until_done' })}
          />
        </View>
      ) : null}
      {value.fireAt && value.mode === 'until_done' ? (
        <ThemedText type="small" themeColor="textSecondary">
          Reminds you daily from {formatReminder(value.fireAt)} until you mark it done.
        </ThemedText>
      ) : null}
    </View>
  );
}

function buildPresets(suggestion?: ReminderSuggestion | null): Preset[] {
  const now = new Date();
  const presets: Preset[] = [];
  if (suggestion) {
    presets.push({ key: 'suggested', label: `✨ ${formatReminder(suggestion.fireAt, now)}`, fireAt: suggestion.fireAt });
  }
  const tonight = atTime(now, 19);
  if (tonight.getTime() - now.getTime() > 3_600_000) presets.push({ key: 'tonight', label: 'Tonight 7 PM', fireAt: tonight });
  presets.push({ key: 'tomorrow', label: 'Tomorrow 9 AM', fireAt: atTime(addDays(now, 1), 9) });
  presets.push({ key: 'three-days', label: 'In 3 days', fireAt: atTime(addDays(now, 3), 9) });
  presets.push({ key: 'none', label: 'No reminder', fireAt: null });
  // Drop generic presets that coincide with the suggestion.
  return presets.filter(
    (p, i) => p.fireAt === null || presets.findIndex((q) => q.fireAt?.getTime() === p.fireAt!.getTime()) === i,
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
});
