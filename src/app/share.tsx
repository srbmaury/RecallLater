import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReminderPicker, type ReminderChoice } from '@/components/reminder-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, EmptyState, FieldList, SectionHeader } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { attachmentFile, deleteAttachments, isPdf } from '@/lib/attachments';
import { addToCalendar } from '@/lib/calendar';
import { parseLocalDateTime } from '@/lib/dates';
import { insertItem } from '@/lib/db/items';
import { useDatabase } from '@/lib/db/provider';
import { fieldRows, TYPE_META } from '@/lib/format';
import { type Intake, processPayloads } from '@/lib/intake';
import { analyze, type ReminderSuggestion } from '@/lib/parse';
import { ensureNotificationPermission, scheduleReminders } from '@/lib/reminders';
import { ITEM_TYPES, type ItemType } from '@/lib/types';

export default function ShareScreen() {
  const { at } = useLocalSearchParams<{ at?: string }>();
  const key = at ?? 'initial';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read the payloads for every new share
  const payloads = useMemo(() => getSharedPayloads(), [key]);
  const [result, setResult] = useState<{ key: string; intake: Intake | null } | null>(null);
  // Processing copies files, so it must run once per share (not per effect re-run).
  const processedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!payloads.length || processedFor.current === key) return;
    processedFor.current = key;
    processPayloads(payloads).then(
      (intake) => setResult({ key, intake }),
      (error) => {
        console.warn(error);
        setResult({ key, intake: null });
      },
    );
  }, [key, payloads]);

  const status = !payloads.length ? 'empty' : result?.key !== key ? 'processing' : result.intake ? 'review' : 'empty';

  if (status === 'processing') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText themeColor="textSecondary">Reading it on your device…</ThemedText>
      </View>
    );
  }
  if (status === 'empty' || !result?.intake) {
    return (
      <View style={styles.centered}>
        <EmptyState title="Nothing to add" message="Share a screenshot, PDF, link or text to RecallLater from another app." />
        <Button label="Go to Today" onPress={() => router.replace('/')} />
      </View>
    );
  }
  return <Review key={key} intake={result.intake} />;
}

function Review({ intake }: { intake: Intake }) {
  const db = useDatabase();
  const theme = useTheme();
  const [now] = useState(() => new Date());
  const initial = useMemo(() => analyze({ text: intake.text, barcodes: intake.barcodes, now }), [intake, now]);

  const [type, setType] = useState<ItemType>(initial.type);
  const analysis = useMemo(
    () => (type === initial.type ? initial : analyze({ text: intake.text, barcodes: intake.barcodes, now, type })),
    [type, initial, intake, now],
  );
  const [title, setTitle] = useState(initial.title);
  const [titleEdited, setTitleEdited] = useState(false);
  const [reminder, setReminder] = useState<ReminderChoice>(fromSuggestion(initial.reminder));
  const [saving, setSaving] = useState(false);
  const [showText, setShowText] = useState(false);

  const changeType = (next: ItemType) => {
    const updated = analyze({ text: intake.text, barcodes: intake.barcodes, now, type: next });
    setType(next);
    if (!titleEdited) setTitle(updated.title);
    setReminder(fromSuggestion(updated.reminder));
  };

  const save = async () => {
    setSaving(true);
    try {
      const item = await insertItem(db, {
        type,
        title: title.trim() || analysis.title,
        sourceType: intake.sourceType,
        extractedText: intake.text,
        fields: analysis.fields,
        attachments: intake.attachments,
        confidence: analysis.confidence,
        dueAt: analysis.keyDate ? parseLocalDateTime(analysis.keyDate).getTime() : null,
      });
      if (reminder.fireAt && reminder.mode !== 'none') {
        const allowed = await ensureNotificationPermission();
        await scheduleReminders(db, item, reminder.mode, reminder.fireAt);
        if (!allowed) {
          Alert.alert('Notifications are off', 'Saved, but the reminder can’t reach you until notifications are turned on in Settings.');
        }
      }
      clearSharedPayloads();
      router.replace('/inbox');
    } catch (error) {
      setSaving(false);
      Alert.alert('Could not save', String(error));
    }
  };

  const discard = () => {
    deleteAttachments(intake.attachments);
    clearSharedPayloads();
    router.replace('/');
  };

  const preview = intake.attachments.find((name) => !isPdf(name));
  const pdf = intake.attachments.find(isPdf);
  const unsure = analysis.type === 'generic' || analysis.confidence < 0.6;

  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {preview ? (
          <Image
            source={{ uri: attachmentFile(preview).uri }}
            style={[styles.preview, { backgroundColor: theme.backgroundElement }]}
            contentFit="contain"
          />
        ) : null}
        {pdf ? <ThemedText themeColor="textSecondary">📄 PDF saved privately on this device</ThemedText> : null}

        <SectionHeader title="We found" />
        <Card>
          <View style={styles.titleRow}>
            <ThemedText style={styles.emoji}>{TYPE_META[type].emoji}</ThemedText>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                setTitleEdited(true);
              }}
              style={[styles.titleInput, { color: theme.text }]}
              multiline
              accessibilityLabel="Title"
            />
          </View>
          <FieldList rows={fieldRows(analysis.fields, type, now)} />
        </Card>

        {unsure ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Not sure what this is. Pick a type if one fits.
          </ThemedText>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {ITEM_TYPES.map((t) => (
            <Chip key={t} label={`${TYPE_META[t].emoji} ${TYPE_META[t].label}`} selected={t === type} onPress={() => changeType(t)} />
          ))}
        </ScrollView>

        <SectionHeader title="Remind me" />
        <ReminderPicker value={reminder} onChange={setReminder} suggestion={analysis.reminder} />

        {analysis.calendar ? (
          <Button
            label="Add to calendar…"
            style={styles.calendar}
            onPress={() => addToCalendar({ ...analysis.calendar!, title: title.trim() || analysis.title }).catch(console.warn)}
          />
        ) : null}

        {intake.warnings.map((warning) => (
          <ThemedText key={warning} type="small" themeColor="textSecondary">
            {warning}
          </ThemedText>
        ))}

        {intake.text ? (
          <>
            <SectionHeader
              title="Text we read"
              trailing={<Button label={showText ? 'Hide' : 'Show'} variant="plain" size="small" onPress={() => setShowText(!showText)} />}
            />
            {showText ? (
              <ThemedText type="code" selectable themeColor="textSecondary">
                {intake.text}
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Button label="Discard" onPress={discard} style={styles.flex} disabled={saving} />
        <Button label="Save" variant="primary" onPress={save} loading={saving} style={styles.save} />
      </View>
    </SafeAreaView>
  );
}

function fromSuggestion(suggestion: ReminderSuggestion | null): ReminderChoice {
  return suggestion ? { mode: suggestion.mode, fireAt: suggestion.fireAt } : { mode: 'none', fireAt: null };
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: Radius.large,
  },
  titleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  emoji: {
    fontSize: 22,
    lineHeight: 30,
  },
  titleInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: 600,
    padding: 0,
  },
  hint: {
    marginTop: Spacing.two,
  },
  chips: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  calendar: {
    marginTop: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  save: {
    flex: 2,
  },
});
