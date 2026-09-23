import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const PROMISES = [
  "We don't scan your photo library",
  "We don't read your messages or email",
  'You choose exactly what you share',
  'Your items are stored on this device',
  'Screenshots and PDFs are never uploaded',
  'Text is read on-device, even offline',
];

export function PrivacyPromise() {
  return (
    <View style={styles.list}>
      {PROMISES.map((promise) => (
        <View key={promise} style={styles.row}>
          <ThemedText themeColor="success">✓</ThemedText>
          <ThemedText style={styles.text}>{promise}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
  },
});
