import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrivacyPromise } from '@/components/privacy-promise';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setSetting } from '@/lib/db/items';
import { useDatabase } from '@/lib/db/provider';

const STEPS = [
  'See something important: a bill, ticket, message or product.',
  'Tap Share and choose RecallLater.',
  'Check what we found and save. We’ll bring it back when it matters.',
];

export default function WelcomeScreen() {
  const db = useDatabase();
  const theme = useTheme();

  const start = async () => {
    await setSetting(db, 'welcomed', new Date().toISOString());
    router.back();
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">RecallLater</ThemedText>
        <ThemedText type="subtitle" themeColor="textSecondary">
          Share it now. Deal with it when it matters.
        </ThemedText>

        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.step}>
              <ThemedText type="heading" themeColor="tint">
                {index + 1}
              </ThemedText>
              <ThemedText style={styles.flex}>{step}</ThemedText>
            </View>
          ))}
        </View>

        <ThemedText type="heading">Your information belongs to you</ThemedText>
        <Card>
          <PrivacyPromise />
        </Card>
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Get started" variant="primary" onPress={start} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  steps: {
    gap: Spacing.three,
    marginVertical: Spacing.three,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  footer: {
    padding: Spacing.four,
  },
});
