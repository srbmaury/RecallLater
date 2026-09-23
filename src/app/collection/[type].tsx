import { Stack, useLocalSearchParams } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { FlatList, StyleSheet, View } from 'react-native';

import { ItemRow } from '@/components/item-row';
import { EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';
import { listByStatus, listByType } from '@/lib/db/items';
import { TYPE_META } from '@/lib/format';
import { ITEM_TYPES, type ItemType } from '@/lib/types';

type CollectionKey = ItemType | 'done' | 'archived';

function loadCollection(db: SQLiteDatabase, key: CollectionKey) {
  return key === 'done' || key === 'archived' ? listByStatus(db, key) : listByType(db, key);
}

export default function CollectionScreen() {
  const theme = useTheme();
  const { type } = useLocalSearchParams<{ type: CollectionKey }>();
  const isType = (ITEM_TYPES as readonly string[]).includes(type);
  const { data } = useDbQuery(loadCollection, type);
  const title = isType ? TYPE_META[type as ItemType].collection : type === 'done' ? 'Done' : 'Archived';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ItemRow item={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={data ? <EmptyState title="Nothing here yet" message="Items you share are sorted here automatically." /> : null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
  },
  separator: {
    height: Spacing.two,
  },
});
