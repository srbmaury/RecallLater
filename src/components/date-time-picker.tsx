import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { type ReactNode, useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PickMode = 'date' | 'datetime';

type Request = { mode: PickMode; resolve: (value: Date | null) => void };

/**
 * `pick()` shows the platform's date (and time) picker and resolves with the chosen
 * date, or `null` if cancelled. Android uses its dialogs; iOS shows an inline picker
 * in a sheet, so render `element` somewhere in the screen.
 */
export function useDateTimePicker(): { pick: (initial: Date, mode: PickMode) => Promise<Date | null>; element: ReactNode } {
  const theme = useTheme();
  const [request, setRequest] = useState<Request | null>(null);
  const [draft, setDraft] = useState(() => new Date());

  const pick = useCallback(
    (initial: Date, mode: PickMode) =>
      new Promise<Date | null>((resolve) => {
        if (Platform.OS === 'android') {
          openAndroid(initial, mode, resolve);
          return;
        }
        setDraft(initial);
        setRequest({ mode, resolve });
      }),
    [],
  );

  const finish = (value: Date | null) => {
    request?.resolve(value);
    setRequest(null);
  };

  const element = request ? (
    <Modal transparent animationType="slide" onRequestClose={() => finish(null)}>
      <Pressable style={styles.backdrop} onPress={() => finish(null)} accessibilityLabel="Cancel" />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <DateTimePicker
          value={draft}
          mode={request.mode}
          display="inline"
          onChange={(_, value) => value && setDraft(value)}
        />
        <View style={styles.actions}>
          <Button label="Cancel" onPress={() => finish(null)} style={styles.flex} />
          <Button label="Done" variant="primary" onPress={() => finish(draft)} style={styles.flex} />
        </View>
      </View>
    </Modal>
  ) : null;

  return { pick, element };
}

function openAndroid(initial: Date, mode: PickMode, resolve: (value: Date | null) => void) {
  DateTimePickerAndroid.open({
    value: initial,
    mode: 'date',
    onChange: (event, date) => {
      if (event.type !== 'set' || !date) return resolve(null);
      if (mode === 'date') return resolve(date);
      // Android has no combined picker: ask for the time next, on the chosen day.
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        onChange: (timeEvent, time) => resolve(timeEvent.type === 'set' && time ? time : null),
      });
    },
  });
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    gap: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
