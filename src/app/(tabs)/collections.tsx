import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { TabScreen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, SectionHeader } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';
import { countByType, VIRTUAL_COLLECTIONS, type VirtualCollection } from '@/lib/db/items';
import { TYPE_META } from '@/lib/format';
import { ITEM_TYPES } from '@/lib/types';

export default function CollectionsScreen() {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);
  const { data: counts } = useDbQuery(countByType);

  const tile = (key: string, emoji: string, label: string, count?: number) => (
    <Pressable
      key={key}
      onPress={() => router.push({ pathname: '/collection/[type]', params: { type: key } })}
      style={({ pressed }) => [styles.tile, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}>
      <ThemedText style={styles.emoji}>{emoji}</ThemedText>
      <ThemedText type="heading">{label}</ThemedText>
      {count !== undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          {count} {count === 1 ? 'item' : 'items'}
        </ThemedText>
      ) : null}
    </Pressable>
  );

  return (
    <TabScreen title="Collections" subtitle="Sorted for you as you share">
      <View style={styles.grid}>
        {tile('done', '✅', 'Done')}
        {tile('archived', '🗄', 'Archived')}
      </View>
      <SectionHeader title="Your collections" />
      {counts && !Object.values(counts).some((count) => count > 0) ? <EmptyState title="Collections grow as you share" message="Save a bill, ticket or message. We'll sort it for you." /> : null}
      <View style={styles.grid}>
        {ITEM_TYPES.filter((type) => (counts?.[type] ?? 0) > 0).sort((a, b) => (counts?.[b] ?? 0) - (counts?.[a] ?? 0)).map((type) => tile(type, TYPE_META[type].emoji, TYPE_META[type].collection, counts?.[type]))}
        {(Object.keys(VIRTUAL_COLLECTIONS) as VirtualCollection[]).filter((key) => (counts?.[key] ?? 0) > 0).map((key) => tile(key, VIRTUAL_COLLECTIONS[key].emoji, VIRTUAL_COLLECTIONS[key].title, counts?.[key]))}
      </View>
      <Button label={showAll ? 'Hide empty collections' : 'Browse all collections'} variant="plain" onPress={() => setShowAll(!showAll)} />
      {showAll ? <View style={styles.grid}>
        {ITEM_TYPES.filter((type) => !(counts?.[type] ?? 0)).map((type) => tile(type, TYPE_META[type].emoji, TYPE_META[type].collection, 0))}
        {(Object.keys(VIRTUAL_COLLECTIONS) as VirtualCollection[]).filter((key) => !(counts?.[key] ?? 0)).map((key) => tile(key, VIRTUAL_COLLECTIONS[key].emoji, VIRTUAL_COLLECTIONS[key].title, 0))}
      </View> : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  emoji: {
    fontSize: 24,
    lineHeight: 32,
  },
});
