import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const PROMISES = [
  "We don't scan your photo library",
  "We don't read your messages or email",
  'You choose exactly what you share',
  'Your items are stored on this device, not in the cloud',
  'Screenshots and PDFs stay on your phone unless you export a backup',
  'Text is read on-device, even offline',
  'AI is optional: it only ever sees text, and only if you choose',
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
