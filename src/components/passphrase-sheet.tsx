import { type ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { passphraseProblem } from '@/lib/backup-crypto';

type Mode = 'create' | 'open';
/** A passphrase, "" for "no passphrase" (create only), or null if dismissed. */
type Answer = string | null;
type Request = { mode: Mode; error?: string; resolve: (answer: Answer) => void };

/**
 * Asks for a backup passphrase. `create` asks twice and offers to skip; `open` asks once
 * and can show why the last attempt failed.
 */
export function usePassphraseSheet(): { ask: (mode: Mode, error?: string) => Promise<Answer>; element: ReactNode } {
  const theme = useTheme();
  const [request, setRequest] = useState<Request | null>(null);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const ask = (mode: Mode, error?: string) =>
    new Promise<Answer>((resolve) => {
      setFirst('');
      setSecond('');
      setProblem(null);
      setRequest({ mode, error, resolve });
    });

  const finish = (answer: Answer) => {
    request?.resolve(answer);
    setRequest(null);
  };

  const submit = () => {
    if (request?.mode === 'create') {
      const weak = passphraseProblem(first);
      if (weak) return setProblem(weak);
      if (first !== second) return setProblem('The two passphrases don’t match.');
    }
    if (!first) return setProblem('Enter the passphrase.');
    finish(first);
  };

  const creating = request?.mode === 'create';
  const input = (value: string, onChange: (text: string) => void, label: string) => (
    <TextInput
      value={value}
      onChangeText={(text) => {
        onChange(text);
        setProblem(null);
      }}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={label}
      placeholderTextColor={theme.textSecondary}
      accessibilityLabel={label}
      onSubmitEditing={submit}
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
    />
  );

  const element = (
    <Modal visible={request !== null} transparent animationType="slide" onRequestClose={() => finish(null)}>
      <Pressable style={styles.backdrop} onPress={() => finish(null)} accessibilityLabel="Close" />
      {/* Android runs edge-to-edge, so the sheet must lift above the keyboard on both platforms. */}
      <KeyboardAvoidingView behavior="padding">
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="heading">{creating ? 'Protect your backup' : 'Enter the backup’s passphrase'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {creating
              ? 'Anyone with the file and the passphrase can read it. There’s no way to recover a forgotten passphrase.'
              : 'This backup is encrypted.'}
          </ThemedText>
          {input(first, setFirst, 'Passphrase')}
          {creating ? input(second, setSecond, 'Passphrase again') : null}
          {problem || request?.error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {problem ?? request?.error}
            </ThemedText>
          ) : null}
          <Button label={creating ? 'Encrypt and save' : 'Open backup'} variant="primary" onPress={submit} />
          {creating ? <Button label="Save without a passphrase" onPress={() => finish('')} /> : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
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
  input: {
    padding: Spacing.three,
    borderRadius: Radius.medium,
    fontSize: 16,
  },
});
