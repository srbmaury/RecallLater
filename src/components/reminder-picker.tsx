import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useDateTimePicker } from '@/components/date-time-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip } from '@/components/ui';
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
  compact = false,
}: {
  value: ReminderChoice;
  onChange: (value: ReminderChoice) => void;
  suggestion?: ReminderSuggestion | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const simple = compact && !expanded;
  const presets = useMemo(() => buildPresets(suggestion), [suggestion]);
  const { pick, element } = useDateTimePicker();
  const selectedKey =
    presets.find((p) => (p.fireAt === null ? value.fireAt === null : p.fireAt.getTime() === value.fireAt?.getTime()))?.key ??
    'custom';

  const choose = (fireAt: Date | null) => {
    if (!fireAt) return onChange({ mode: 'none', fireAt: null });
    const mode = value.mode === 'none' ? (suggestion?.mode ?? 'once') : value.mode;
    onChange({ mode, fireAt });
  };

  const pickCustom = async () => {
    const chosen = await pick(value.fireAt ?? atTime(addDays(new Date(), 1), 9), 'datetime');
    if (chosen && chosen.getTime() > Date.now()) choose(chosen);
  };

  return (
    <View style={styles.container}>
      {simple ? (
        <View style={styles.row}>
          {suggestion ? <Chip label={formatReminder(suggestion.fireAt)} selected={selectedKey === 'suggested'} onPress={() => onChange({ mode: suggestion.mode, fireAt: suggestion.fireAt })} /> : null}
          {value.fireAt && selectedKey !== 'suggested' ? <Chip label={formatReminder(value.fireAt)} selected onPress={() => {}} /> : null}
          <Chip label="No reminder" selected={!value.fireAt} onPress={() => choose(null)} />
        </View>
      ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {presets.filter((preset) => !compact || preset.key !== 'none').map((preset) => (
          <Chip key={preset.key} label={preset.label} selected={selectedKey === preset.key} onPress={() => choose(preset.fireAt)} />
        ))}
        <Chip
          label={selectedKey === 'custom' && value.fireAt ? formatReminder(value.fireAt) : 'Pick date & time…'}
          selected={selectedKey === 'custom' && value.fireAt !== null}
          onPress={pickCustom}
        />
      </ScrollView>
      )}
      {compact && !simple ? <Chip label="No reminder" selected={!value.fireAt} onPress={() => choose(null)} /> : null}
      {compact ? <Button label={expanded ? 'Fewer reminder options' : 'Change reminder…'} variant="plain" size="small" onPress={() => setExpanded(!expanded)} /> : null}
      {value.fireAt && !simple ? (
        <View style={styles.row}>
          <Chip label="Remind once" selected={value.mode === 'once'} onPress={() => onChange({ ...value, mode: 'once' })} />
          <Chip
            label="Until done"
            selected={value.mode === 'until_done'}
            onPress={() => onChange({ ...value, mode: 'until_done' })}
          />
        </View>
      ) : null}
      {value.fireAt ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value.mode === 'until_done' ? `Reminds you daily from ${formatReminder(value.fireAt)} until you mark it done.` : `Reminds you once ${formatReminder(value.fireAt)}.`}
        </ThemedText>
      ) : null}
      {element}
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
