import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import type { SharePayload } from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setPendingPayloads } from '@/lib/pending';

function review(payloads: SharePayload[]) {
  if (!payloads.length) return;
  setPendingPayloads(payloads);
  router.push({ pathname: '/share', params: { source: 'add', at: String(Date.now()) } });
}

/**
 * Adds something from inside the app. Both pickers are the operating system's own:
 * the app sees only what the user picks and needs no photo or storage permission.
 */
async function pickPhotos() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 5,
    quality: 1,
  });
  if (result.canceled) return;
  review(result.assets.map((asset) => ({ value: asset.uri, shareType: 'image', mimeType: asset.mimeType ?? 'image/jpeg' })));
}

async function pickFiles() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return;
  review(
    result.assets.map((asset) => ({
      value: asset.uri,
      shareType: asset.mimeType?.startsWith('image/') ? 'image' : 'file',
      mimeType: asset.mimeType ?? (asset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined),
    })),
  );
}

const OPTIONS = [
  { key: 'photo', label: 'Photo or screenshot', detail: 'Pick from your photos', ios: 'photo', android: 'image', run: pickPhotos },
  { key: 'file', label: 'PDF or file', detail: 'Tickets, bills, invoices', ios: 'doc', android: 'description', run: pickFiles },
  { key: 'text', label: 'Type or paste text', detail: 'A message, a note, a link', ios: 'text.cursor', android: 'edit_note', run: async () => router.push('/add-text') },
] as const;

/** The ＋ button in tab headers, and the sheet of ways to add something it opens. */
export function AddButton() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const choose = (run: () => Promise<unknown>) => {
    setOpen(false);
    run().catch(console.warn);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.addButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
        <SymbolView name={{ ios: 'plus', android: 'add' }} tintColor={theme.onTint} size={22} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="heading" style={styles.sheetTitle}>
            Add to RecallLater
          </ThemedText>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              onPress={() => choose(option.run)}
              style={({ pressed }) => [styles.option, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
              <SymbolView name={{ ios: option.ios, android: option.android }} tintColor={theme.tint} size={24} />
              <View style={styles.optionText}>
                <ThemedText type="heading">{option.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {option.detail}
                </ThemedText>
              </View>
            </Pressable>
          ))}
          <ThemedText type="small" themeColor="textSecondary" style={styles.tip}>
            Tip: in any app, tap Share and pick RecallLater.
          </ThemedText>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  sheetTitle: {
    marginBottom: Spacing.one,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  optionText: {
    flex: 1,
    gap: Spacing.half,
  },
  tip: {
    textAlign: 'center',
    marginTop: Spacing.one,
  },
});
