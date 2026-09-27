import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { TabScreen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { SectionHeader } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';
import { countByType, VIRTUAL_COLLECTIONS, type VirtualCollection } from '@/lib/db/items';
import { TYPE_META } from '@/lib/format';
import { ITEM_TYPES } from '@/lib/types';

export default function CollectionsScreen() {
  const theme = useTheme();
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
        {ITEM_TYPES.map((type) => tile(type, TYPE_META[type].emoji, TYPE_META[type].collection, counts?.[type] ?? 0))}
        {(Object.keys(VIRTUAL_COLLECTIONS) as VirtualCollection[]).map((key) =>
          tile(key, VIRTUAL_COLLECTIONS[key].emoji, VIRTUAL_COLLECTIONS[key].title, counts?.[key] ?? 0),
        )}
      </View>
      <SectionHeader title="History" />
      <View style={styles.grid}>
        {tile('done', '✅', 'Done')}
        {tile('archived', '🗄', 'Archived')}
      </View>
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
