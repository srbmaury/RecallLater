import { type ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDateTimePicker } from '@/components/date-time-picker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, atTime, formatDay, isFuture } from '@/lib/dates';
import { snoozeOptions } from '@/lib/snooze';

/**
 * "Later" for an item: a sheet of quick choices plus a custom date and time.
 * `ask(title)` resolves with the chosen time, or null if dismissed.
 */
export function useSnoozeSheet(): { ask: (title: string) => Promise<Date | null>; element: ReactNode } {
  const theme = useTheme();
  const { pick, element: picker } = useDateTimePicker();
  const [request, setRequest] = useState<{ title: string; now: Date; resolve: (until: Date | null) => void } | null>(null);

  const ask = (title: string) => new Promise<Date | null>((resolve) => setRequest({ title, now: new Date(), resolve }));

  const finish = (until: Date | null) => {
    request?.resolve(until);
    setRequest(null);
  };

  const custom = async () => {
    const resolve = request?.resolve;
    setRequest(null);
    const chosen = await pick(atTime(addDays(new Date(), 1), 9), 'datetime');
    resolve?.(chosen && isFuture(chosen) ? chosen : null);
  };

  const option = (key: string, label: string, detail: string | undefined, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.option, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <ThemedText type="heading">{label}</ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : null}
    </Pressable>
  );

  const element = (
    <>
      <Modal visible={request !== null} transparent animationType="slide" onRequestClose={() => finish(null)}>
        <Pressable style={styles.backdrop} onPress={() => finish(null)} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="heading" numberOfLines={1}>
            Remind me later
          </ThemedText>
          {request ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {request.title}
            </ThemedText>
          ) : null}
          {request
            ? snoozeOptions(request.now).map((choice) =>
                option(
                  choice.key,
                  choice.label,
                  `${formatDay(choice.until, request.now)}, ${choice.until.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
                  () => finish(choice.until),
                ),
              )
            : null}
          {option('custom', 'Pick date & time…', undefined, () => {
            custom().catch(console.warn);
          })}
        </SafeAreaView>
      </Modal>
      {picker}
    </>
  );

  return { ask, element };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
  },
  option: {
    padding: Spacing.three,
    borderRadius: Radius.medium,
    gap: Spacing.half,
  },
});
