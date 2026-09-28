import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReminderPicker, type ReminderChoice } from '@/components/reminder-picker';
import { RepeatPicker } from '@/components/repeat-picker';
import { ThemedText } from '@/components/themed-text';
import { FieldEditor } from '@/components/field-editor';
import { Button, Card, Chip, EmptyState, SectionHeader } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { attachmentFile, deleteAttachments, isPdf } from '@/lib/attachments';
import { AI_SETTING, type AiMode, aiModeOf, askAi, isAiConfigured } from '@/lib/ai/client';
import { type AiExtraction, mergeWithAi } from '@/lib/ai/merge';
import { textForAi } from '@/lib/ai/redact';
import { addToCalendar } from '@/lib/calendar';
import { formatDay, parseLocalDateTime } from '@/lib/dates';
import { findDuplicate, getItem, getSetting, insertItem, listDueOn, setSetting, updateItem } from '@/lib/db/items';
import { useDatabase } from '@/lib/db/provider';
import { TYPE_META } from '@/lib/format';
import { type Intake, processPayloads } from '@/lib/intake';
import { recordCorrections } from '@/lib/corrections';
import { clearPendingPayloads, getPendingPayloads } from '@/lib/pending';
import { type Analysis, analyze, keyDateOf, type ReminderSuggestion } from '@/lib/parse';
import { suggestCalendar, suggestReminder } from '@/lib/parse/suggest';
import { ensureNotificationPermission, refreshSummaries, scheduleReminders } from '@/lib/reminders';
import { type ExtractedFields, type Item, ITEM_TYPES, type ItemType } from '@/lib/types';

function savedWhen(createdAt: number): string {
  const day = formatDay(new Date(createdAt));
  return day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : `on ${day}`;
}

export default function ShareScreen() {
  const { at, source } = useLocalSearchParams<{ at?: string; source?: string }>();
  const key = at ?? 'initial';
  // Items from the ＋ Add sheet and the welcome screen's sample arrive in the same shape as OS shares.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read the payloads for every new share
  const payloads = useMemo(() => (source === 'add' || source === 'sample' ? getPendingPayloads() : getSharedPayloads()), [key]);
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
        <EmptyState
          title="Nothing to add"
          message="Share a screenshot, PDF, link or text to RecallLater from another app, or tap ＋ on Today."
        />
        <Button label="Go to Today" onPress={() => router.replace('/')} />
      </View>
    );
  }
  return <Review key={key} intake={result.intake} sample={source === 'sample'} />;
}

function Review({ intake, sample }: { intake: Intake; sample: boolean }) {
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
  const [reminderTouched, setReminderTouched] = useState(false);
  // The user's corrections to what was extracted; reset when the type changes.
  const [fieldEdits, setFieldEdits] = useState<ExtractedFields | null>(null);
  const fields = fieldEdits ?? analysis.fields;
  const suggestion = fieldEdits ? suggestReminder(type, fields, now) : analysis.reminder;
  const calendar = fieldEdits ? suggestCalendar(type, title.trim() || analysis.title, fields) : analysis.calendar;
  // Other things already due that day, so a busy day is visible before saving.
  const keyDate = keyDateOf(fields);
  const [sameDay, setSameDay] = useState<{ date: string; titles: string[] } | null>(null);
  useEffect(() => {
    if (!keyDate) return;
    let current = true;
    listDueOn(db, parseLocalDateTime(keyDate)).then(
      (titles) => current && setSameDay({ date: keyDate, titles }),
      console.warn,
    );
    return () => {
      current = false;
    };
  }, [db, keyDate]);
  const alsoDue = keyDate && sameDay?.date === keyDate ? sameDay.titles : [];
  const [saving, setSaving] = useState(false);
  const [showText, setShowText] = useState(false);

  // AI understanding (opt-in). `before` lets the user undo what the AI changed.
  type Snapshot = { type: ItemType; title: string; fieldEdits: ExtractedFields | null; reminder: ReminderChoice };
  const [aiReading, setAiReading] = useState<Analysis | null>(null);
  const [ai, setAi] = useState<{ status: 'idle' | 'asking' | 'applied' | 'failed'; before?: Snapshot }>({ status: 'idle' });
  const [aiMode, setAiMode] = useState<AiMode | null>(null);
  const aiAlways = aiMode === 'always';
  const autoAsked = useRef(false);
  const canAskAi = isAiConfigured() && intake.text.trim() !== '';
  // Guessed fields stay marked until the user changes them.
  const reading = aiReading ?? analysis;
  const unsureFields = reading.unsure.filter((key) => fields[key] === reading.fields[key]);

  const applyAi = (extraction: AiExtraction) => {
    const merged = mergeWithAi({ text: intake.text, barcodes: intake.barcodes, now }, extraction);
    setAiReading(merged);
    setAi({ status: 'applied', before: { type, title, fieldEdits, reminder } });
    setType(merged.type);
    setFieldEdits(merged.fields);
    if (!titleEdited) setTitle(merged.title);
    if (!reminderTouched) setReminder(fromSuggestion(merged.reminder));
  };

  const undoAi = () => {
    const before = ai.before;
    if (!before) return;
    setType(before.type);
    setTitle(before.title);
    setFieldEdits(before.fieldEdits);
    setReminder(before.reminder);
    setAiReading(null);
    setAi({ status: 'idle' });
  };

  const requestAi = () => {
    setAi({ status: 'asking' });
    askAi(intake.text, now).then(applyAi, () => setAi({ status: 'failed' }));
  };

  useEffect(() => {
    getSetting(db, AI_SETTING).then((value) => setAiMode(aiModeOf(value)));
  }, [db]);

  // With AI switched on in Settings, ask once for every share.
  useEffect(() => {
    if (!aiAlways || autoAsked.current || !canAskAi) return;
    autoAsked.current = true;
    askAi(intake.text, now).then(applyAi, () => setAi({ status: 'failed' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the setting is known
  }, [aiAlways]);

  const confirmAi = () => {
    const sent = textForAi(intake.text);
    Alert.alert(
      'Improve with AI?',
      `Only this text is sent, never the image. Phone numbers, emails and account numbers are removed first.\n\n${sent.length > 600 ? `${sent.slice(0, 600)}…` : sent}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send once', onPress: requestAi },
        {
          text: 'Always',
          onPress: () => {
            autoAsked.current = true;
            setAiMode('always');
            setSetting(db, AI_SETTING, 'always').catch(console.warn);
            requestAi();
          },
        },
      ],
    );
  };

  const changeType = (next: ItemType) => {
    const updated = analyze({ text: intake.text, barcodes: intake.barcodes, now, type: next });
    setType(next);
    setFieldEdits(null);
    if (!titleEdited) setTitle(updated.title);
    setReminder(fromSuggestion(updated.reminder));
    setReminderTouched(false);
  };

  const changeFields = (next: ExtractedFields) => {
    setFieldEdits(next);
    if (!reminderTouched) setReminder(fromSuggestion(suggestReminder(type, next, now)));
  };

  const changeReminder = (next: ReminderChoice) => {
    setReminder(next);
    setReminderTouched(true);
  };

  const save = async () => {
    setSaving(true);
    const candidate = {
      type,
      title: title.trim() || analysis.title,
      fields,
      dueAt: keyDateOf(fields) ? parseLocalDateTime(keyDateOf(fields)!).getTime() : null,
    };
    const existing = await findDuplicate(db, candidate).catch((error) => {
      console.warn('Duplicate check failed', error);
      return null;
    });
    if (!existing) return persist(candidate, null);
    Alert.alert(
      'Already saved',
      `You saved “${existing.title}” ${savedWhen(existing.createdAt)}. Update it with these details, or keep both?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setSaving(false) },
        { text: 'Save as new', onPress: () => persist(candidate, null) },
        { text: 'Update it', onPress: () => persist(candidate, existing) },
      ],
      { cancelable: true, onDismiss: () => setSaving(false) },
    );
  };

  /** Saves a new item, or folds this share into `existing` (new details, its files added). */
  const persist = async (candidate: Pick<Item, 'type' | 'title' | 'fields' | 'dueAt'>, existing: Item | null) => {
    let savedItem: Item | null = null;
    try {
      if (existing) {
        await updateItem(db, existing.id, {
          ...candidate,
          extractedText: intake.text || existing.extractedText,
          attachments: [...existing.attachments, ...intake.attachments],
        });
        savedItem = await getItem(db, existing.id);
      } else {
        savedItem = await insertItem(db, {
          ...candidate,
          sourceType: intake.sourceType,
          extractedText: intake.text,
          attachments: intake.attachments,
          confidence: analysis.confidence,
        });
      }
      if (savedItem && reminder.fireAt && reminder.mode !== 'none') {
        const allowed = await ensureNotificationPermission();
        if (allowed) {
          try {
            await scheduleReminders(db, savedItem, reminder.mode, reminder.fireAt);
          } catch (error) {
            console.warn('Item saved, but reminder scheduling failed', error);
            Alert.alert('Saved without a reminder', 'The item is in your inbox. You can set its reminder from the item details.');
          }
        }
        else Alert.alert('Notifications are off', 'Saved without a reminder. Turn on notifications in Settings to use reminders.');
      }
      recordCorrections(db, reading, { type, title: candidate.title, fields }).catch(console.warn);
      refreshSummaries(db).catch(console.warn);
      clearIncoming();
      router.replace('/inbox');
    } catch (error) {
      // If anything fails after the insert, leave the item accessible and avoid a
      // retry creating a duplicate. Any reminder failure is handled above.
      if (savedItem) {
        clearIncoming();
        router.replace('/inbox');
        Alert.alert('Saved', 'Your item is in the inbox, but some follow-up step failed.');
        return;
      }
      setSaving(false);
      Alert.alert('Could not save', String(error));
    }
  };

  const discard = () => {
    deleteAttachments(intake.attachments);
    clearIncoming();
    router.replace('/');
  };

  // Leaving the review by any route (header, Android back) discards it, so copied
  // files and the pending share never linger half-processed.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      discard();
      return true;
    });
    return () => subscription.remove();
  });

  const preview = intake.attachments.find((name) => !isPdf(name));
  const pdf = intake.attachments.find(isPdf);
  const unsure = analysis.type === 'generic' || analysis.confidence < 0.6;

  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              accessibilityHint="Discards this item"
              onPress={discard}
              disabled={saving}
              hitSlop={12}
              style={({ pressed }) => [styles.back, { opacity: pressed || saving ? 0.5 : 1 }]}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back' }} tintColor={theme.text} size={24} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {preview ? (
          <Image
            source={{ uri: attachmentFile(preview).uri }}
            style={[styles.preview, { backgroundColor: theme.backgroundElement }]}
            contentFit="contain"
          />
        ) : null}
        {pdf ? <ThemedText themeColor="textSecondary">📄 PDF saved privately on this device</ThemedText> : null}

        {sample ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            This is a sample bill, read on your phone just now. Discard it when you’re done, or save it to see a reminder.
          </ThemedText>
        ) : null}
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
          <FieldEditor key={type} type={type} fields={fields} onChange={changeFields} unsure={unsureFields} />
        </Card>

        {ai.status === 'asking' || (aiAlways && canAskAi && ai.status === 'idle' && !ai.before) ? (
          <View style={styles.aiRow}>
            <ActivityIndicator size="small" />
            <ThemedText type="small" themeColor="textSecondary">
              Improving with AI…
            </ThemedText>
          </View>
        ) : ai.status === 'applied' ? (
          <View style={styles.aiRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              ✨ Improved with AI. Check before saving.
            </ThemedText>
            <Button label="Undo" variant="plain" size="small" onPress={undoAi} />
          </View>
        ) : ai.status === 'failed' ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            AI couldn’t be reached. Showing what was found on this device.
          </ThemedText>
        ) : null}
        {(unsure || aiMode === 'ask') && ai.status !== 'applied' && ai.status !== 'asking' ? (
          <View style={styles.aiRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {unsure ? 'Not sure what this is. Pick a type if one fits.' : 'Something not right?'}
            </ThemedText>
            {canAskAi && aiMode === 'ask' ? (
              <Button label="✨ Improve with AI" variant="plain" size="small" onPress={confirmAi} />
            ) : null}
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {ITEM_TYPES.map((t) => (
            <Chip key={t} label={`${TYPE_META[t].emoji} ${TYPE_META[t].label}`} selected={t === type} onPress={() => changeType(t)} />
          ))}
        </ScrollView>

        <SectionHeader title="Remind me" />
        <ReminderPicker value={reminder} onChange={changeReminder} suggestion={suggestion} />
        {alsoDue.length ? (
          <ThemedText type="small" themeColor="textSecondary">
            Also due {formatDay(parseLocalDateTime(keyDate!)).replace(/^(Today|Tomorrow)$/, (d) => d.toLowerCase())}: {alsoDue.join(', ')}
          </ThemedText>
        ) : null}
        <RepeatPicker fields={fields} onChange={changeFields} />

        {calendar ? (
          <Button
            label="Add to calendar…"
            style={styles.calendar}
            onPress={() => addToCalendar({ ...calendar, title: title.trim() || analysis.title }).catch(console.warn)}
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

/** The item came from the OS share sheet or from the ＋ Add sheet; clear whichever it was. */
function clearIncoming() {
  clearSharedPayloads();
  clearPendingPayloads();
}

function fromSuggestion(suggestion: ReminderSuggestion | null): ReminderChoice {
  return suggestion ? { mode: suggestion.mode, fireAt: suggestion.fireAt } : { mode: 'none', fireAt: null };
}

const styles = StyleSheet.create({
  back: {
    paddingRight: Spacing.three,
  },
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
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
