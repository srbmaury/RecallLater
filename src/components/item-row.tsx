import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatReminder, summarize, TYPE_META } from '@/lib/format';
import type { Item } from '@/lib/types';

type Props = {
  item: Item;
  /** Show Done / Later buttons (Today screen). */
  onDone?: (item: Item) => void;
  onLater?: (item: Item) => void;
  showType?: boolean;
};

export function ItemRow({ item, onDone, onLater, showType }: Props) {
  const theme = useTheme();
  const meta = TYPE_META[item.type];
  const summary = summarize(item);
  const done = item.status !== 'active';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.header}>
        <ThemedText style={styles.emoji}>{meta.emoji}</ThemedText>
        <View style={styles.body}>
          <ThemedText type="heading" numberOfLines={2} style={done && styles.done}>
            {item.title}
          </ThemedText>
          {summary ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {summary}
            </ThemedText>
          ) : null}
          {showType || item.nextReminderAt ? (
            <ThemedText type="small" themeColor="textSecondary">
              {[showType && meta.collection, item.nextReminderAt && `⏰ ${formatReminder(item.nextReminderAt)}`]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          ) : null}
        </View>
      </View>
      {onDone || onLater ? (
        <View style={styles.actions}>
          {onDone ? <Button label="Done" size="small" variant="primary" onPress={() => onDone(item)} /> : null}
          {onLater ? <Button label="Later" size="small" onPress={() => onLater(item)} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  emoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  done: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingLeft: 22 + Spacing.three,
  },
});
