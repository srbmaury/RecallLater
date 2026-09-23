import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ReminderPicker } from '@/components/reminder-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, FieldList, SectionHeader } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';
import { attachmentFile, deleteAttachments, isPdf } from '@/lib/attachments';
import { addToCalendar } from '@/lib/calendar';
import { formatDay, parseLocalDateTime } from '@/lib/dates';
import { deleteItem, getItem, setStatus, updateItem } from '@/lib/db/items';
import { fieldRows, formatReminder, summarize, TYPE_META } from '@/lib/format';
import { analyze } from '@/lib/parse';
import { suggestCalendar, suggestReminder } from '@/lib/parse/suggest';
import { archiveItem, cancelReminders, completeItem, ensureNotificationPermission, scheduleReminders } from '@/lib/reminders';
import { ITEM_TYPES, type Item, type ItemType } from '@/lib/types';

const SOURCE_LABELS: Record<Item['sourceType'], string> = {
  image: 'a screenshot',
  pdf: 'a PDF',
  url: 'a link',
  text: 'shared text',
  file: 'a file',
};

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: item, reload, db } = useDbQuery(getItem, id);

  if (item === undefined) return null;
  if (item === null) {
    return (
      <View style={styles.missing}>
        <ThemedText themeColor="textSecondary">This item was deleted.</ThemedText>
      </View>
    );
  }
  return <ItemDetail key={item.updatedAt} item={item} reload={reload} db={db} />;
}

function ItemDetail({ item, reload, db }: { item: Item; reload: () => void; db: Parameters<typeof getItem>[0] }) {
  const theme = useTheme();
  const [title, setTitle] = useState(item.title);
  const [showText, setShowText] = useState(false);
  const active = item.status === 'active';
  const calendar = suggestCalendar(item.type, item.title, item.fields);

  const run = (action: () => Promise<unknown>) => () => {
    action()
      .then(reload)
      .catch((error) => Alert.alert('Something went wrong', String(error)));
  };

  const saveTitle = run(async () => {
    const next = title.trim();
    if (next && next !== item.title) await updateItem(db, item.id, { title: next });
  });

  const changeType = (type: ItemType) =>
    run(async () => {
      const analysis = analyze({ text: item.extractedText, barcodes: item.fields.barcodes, type });
      await updateItem(db, item.id, {
        type,
        fields: analysis.fields,
        dueAt: analysis.keyDate ? parseLocalDateTime(analysis.keyDate).getTime() : null,
      });
    })();

  const confirmDelete = () =>
    Alert.alert('Delete this item?', 'Its files and reminders are removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await cancelReminders(db, item.id);
          await deleteItem(db, item.id);
          deleteAttachments(item.attachments);
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: TYPE_META[item.type].label }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          onEndEditing={saveTitle}
          multiline
          submitBehavior="blurAndSubmit"
          style={[styles.title, { color: theme.text }, !active && styles.done]}
          accessibilityLabel="Title"
        />
        {summarize(item) ? <ThemedText themeColor="textSecondary">{summarize(item)}</ThemedText> : null}

        {item.attachments.map((name) =>
          isPdf(name) ? (
            <Button
              key={name}
              label="📄 Open PDF"
              onPress={() => shareAsync(attachmentFile(name).uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })}
            />
          ) : (
            <Image
              key={name}
              source={{ uri: attachmentFile(name).uri }}
              style={[styles.image, { backgroundColor: theme.backgroundElement }]}
              contentFit="contain"
            />
          ),
        )}

        {fieldRows(item.fields, item.type).length ? (
          <Card>
            <FieldList rows={fieldRows(item.fields, item.type)} />
          </Card>
        ) : null}

        {active ? (
          <>
            <SectionHeader title="Reminder" />
            <ThemedText type="small" themeColor="textSecondary">
              {item.nextReminderAt
                ? `Next: ${formatReminder(item.nextReminderAt)}${item.reminderMode === 'until_done' ? ' · repeats daily until done' : ''}`
                : 'No reminder set.'}
            </ThemedText>
            <ReminderPicker
              value={{ mode: item.reminderMode, fireAt: item.nextReminderAt ? new Date(item.nextReminderAt) : null }}
              suggestion={suggestReminder(item.type, item.fields, new Date())}
              onChange={(choice) =>
                run(async () => {
                  if (choice.fireAt) await ensureNotificationPermission();
                  await scheduleReminders(db, item, choice.mode, choice.fireAt);
                })()
              }
            />
          </>
        ) : null}

        <View style={styles.actions}>
          {active ? (
            <Button label="Mark done" variant="primary" onPress={run(() => completeItem(db, item.id))} />
          ) : (
            <Button label="Move back to inbox" onPress={run(() => setStatus(db, item.id, 'active'))} />
          )}
          {calendar && active ? <Button label="Add to calendar…" onPress={() => addToCalendar(calendar).catch(console.warn)} /> : null}
          {active ? <Button label="Archive" onPress={run(() => archiveItem(db, item.id))} /> : null}
        </View>

        <SectionHeader title="Type" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {ITEM_TYPES.map((t) => (
            <Chip key={t} label={`${TYPE_META[t].emoji} ${TYPE_META[t].label}`} selected={t === item.type} onPress={() => changeType(t)} />
          ))}
        </ScrollView>

        {item.extractedText ? (
          <>
            <SectionHeader
              title="Original text"
              trailing={<Button label={showText ? 'Hide' : 'Show'} variant="plain" size="small" onPress={() => setShowText(!showText)} />}
            />
            {showText ? (
              <ThemedText type="code" selectable themeColor="textSecondary">
                {item.extractedText}
              </ThemedText>
            ) : null}
          </>
        ) : null}

        <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
          Added {formatDay(new Date(item.createdAt))} from {SOURCE_LABELS[item.sourceType]}
        </ThemedText>
        <Button label="Delete" variant="danger" onPress={confirmDelete} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    padding: 0,
  },
  done: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  image: {
    width: '100%',
    height: 320,
    borderRadius: Radius.large,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  chips: {
    gap: Spacing.two,
  },
  meta: {
    marginTop: Spacing.four,
    textAlign: 'center',
  },
});
