import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setPendingPayloads } from '@/lib/pending';

/**
 * Type or paste text (a message, a note, a link), then review it like a share.
 * Actions live at the top so the keyboard can never cover them.
 */
export default function AddTextScreen() {
  const theme = useTheme();
  const [text, setText] = useState('');

  // The clipboard is only read when the user taps Paste.
  const paste = async () => {
    const copied = await Clipboard.getStringAsync();
    if (copied) setText((current) => (current ? `${current}\n${copied}` : copied));
  };

  const next = () => {
    const value = text.trim();
    if (!value) return;
    setPendingPayloads([{ value, shareType: /^https?:\/\/\S+$/i.test(value) ? 'url' : 'text', mimeType: 'text/plain' }]);
    router.replace({ pathname: '/share', params: { source: 'add', at: String(Date.now()) } });
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button label="Continue" variant="plain" size="small" onPress={next} disabled={!text.trim()} />
          ),
        }}
      />
      <View style={styles.content}>
        <View style={styles.hintRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            For example: “Pay rent by 5th”, or a message someone sent you.
          </ThemedText>
          <Button label="Paste" size="small" onPress={() => paste().catch(console.warn)} />
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type or paste here"
          placeholderTextColor={theme.textSecondary}
          multiline
          autoFocus
          textAlignVertical="top"
          accessibilityLabel="Text to add"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    fontSize: 16,
  },
});
