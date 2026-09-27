import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { readLocalFile } from '@/lib/intake';

/**
 * Development only: runs the same on-device OCR as sharing, over every file in the
 * app's `ocr-batch/` folder, and writes `ocr-batch/results.json`. Used by
 * e2e/ocr-batch.sh to evaluate the parser on whole datasets in minutes.
 *
 *   adb shell am start -d recalllater://dev-ocr com.srbmaury.recalllater
 */
export default function DevOcrScreen() {
  const theme = useTheme();
  const [status, setStatus] = useState('Starting…');

  useEffect(() => {
    if (!__DEV__) return;
    let cancelled = false;
    (async () => {
      const dir = new Directory(Paths.document, 'ocr-batch');
      const files = dir.exists
        ? dir.list().filter((entry): entry is File => entry instanceof File && /\.(jpe?g|png|webp|pdf)$/i.test(entry.name))
        : [];
      const results = [];
      for (const [index, file] of files.entries()) {
        if (cancelled) return;
        setStatus(`Reading ${index + 1}/${files.length}: ${file.name}`);
        const read = await readLocalFile(file.uri, file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image');
        results.push({ file: file.name, ...read });
      }
      new File(dir, 'results.json').write(JSON.stringify(results));
      setStatus(`Done: ${results.length} files`);
    })().catch((error) => setStatus(`Failed: ${String(error)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <ThemedText>{__DEV__ ? status : 'Not available.'}</ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
  },
});
