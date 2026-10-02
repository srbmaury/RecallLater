import type { SQLiteDatabase } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddButton } from '@/components/add-sheet';
import { announceNextOccurrence } from '@/components/repeat-picker';
import { ItemRow } from '@/components/item-row';
import { useSnoozeSheet } from '@/components/snooze-sheet';
import { TabScreen } from '@/components/screen';
import { Button, EmptyState, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDbQuery } from '@/hooks/use-db-query';
import { listOlderOverdue, listToday, listUpcoming } from '@/lib/db/items';
import { completeItem, snooze } from '@/lib/reminders';
import type { Item } from '@/lib/types';

async function loadToday(db: SQLiteDatabase) {
  const now = new Date();
  const [today, upcoming, older] = await Promise.all([listToday(db, now), listUpcoming(db, 7, now), listOlderOverdue(db, now)]);
  return { today, upcoming, older };
}

export default function TodayScreen() {
  const [showOlder, setShowOlder] = useState(false);
  const { data, reload, db } = useDbQuery(loadToday);

  const onDone = async (item: Item) => {
    const next = await completeItem(db, item.id);
    reload();
    announceNextOccurrence(next);
  };
  const { ask: askLater, element: laterSheet } = useSnoozeSheet();
  const onLater = async (item: Item) => {
    const until = await askLater(item.title);
    if (!until) return;
    await snooze(db, item.id, until);
    reload();
  };

  const today = data?.today ?? [];
  const upcoming = data?.upcoming ?? [];
  const older = data?.older ?? [];

  return (
    <TabScreen
      action={<AddButton />}
      title="Today"
      subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
      {data && !today.length && !upcoming.length && !older.length ? (
        <EmptyState
          title="Nothing needs you today"
          message="Share a bill, ticket, screenshot or message to RecallLater from any app. It will show up here when it matters."
        />
      ) : null}
      {today.length ? (
        <View style={styles.list}>
          {today.map((item) => (
            <ItemRow key={item.id} item={item} onDone={onDone} onLater={onLater} />
          ))}
        </View>
      ) : data && (upcoming.length || older.length) ? (
        <EmptyState title="All clear for today" message={older.length ? 'You still have older overdue items to review.' : "Here is what's coming up."} />
      ) : null}
      {upcoming.length ? (
        <>
          <SectionHeader title="Next 7 days" />
          <View style={styles.list}>
            {upcoming.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </View>
        </>
      ) : null}
      {older.length ? (
        <>
          <SectionHeader title={`Older overdue · ${older.length}`} trailing={<Button label={showOlder ? 'Hide older items' : 'Review older items'} variant="plain" size="small" onPress={() => setShowOlder(!showOlder)} />} />
          {showOlder ? <View style={styles.list}>{older.map((item) => <ItemRow key={item.id} item={item} onDone={onDone} onLater={onLater} />)}</View> : null}
        </>
      ) : null}
      {laterSheet}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
});
