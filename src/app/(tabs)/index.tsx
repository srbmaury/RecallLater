import type { SQLiteDatabase } from 'expo-sqlite';
import { StyleSheet, View } from 'react-native';

import { ItemRow } from '@/components/item-row';
import { TabScreen } from '@/components/screen';
import { EmptyState, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDbQuery } from '@/hooks/use-db-query';
import { addDays, atTime } from '@/lib/dates';
import { listToday, listUpcoming } from '@/lib/db/items';
import { completeItem, snooze } from '@/lib/reminders';
import type { Item } from '@/lib/types';

async function loadToday(db: SQLiteDatabase) {
  return { today: await listToday(db), upcoming: await listUpcoming(db) };
}

export default function TodayScreen() {
  const { data, reload, db } = useDbQuery(loadToday);

  const onDone = async (item: Item) => {
    await completeItem(db, item.id);
    reload();
  };
  // "Later" on the Today list means tomorrow morning, not a few hours.
  const onLater = async (item: Item) => {
    await snooze(db, item.id, atTime(addDays(new Date(), 1), 9));
    reload();
  };

  const today = data?.today ?? [];
  const upcoming = data?.upcoming ?? [];

  return (
    <TabScreen
      title="Today"
      subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
      {data && !today.length && !upcoming.length ? (
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
      ) : data && upcoming.length ? (
        <EmptyState title="All clear for today" message="Here is what's coming up." />
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
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
});
