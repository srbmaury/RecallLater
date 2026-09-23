import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ItemRow } from '@/components/item-row';
import { TabList } from '@/components/screen';
import { Chip, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchItems } from '@/lib/db/items';
import { useDatabase } from '@/lib/db/provider';
import { parseQuery } from '@/lib/search';
import type { Item } from '@/lib/types';

const EXAMPLES = ['bills', 'due this week', 'trips', 'expiring this month', 'receipts', 'overdue'];

export default function SearchScreen() {
  const db = useDatabase();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; items: Item[] } | null>(null);
  const trimmed = query.trim();
  // Only show results that belong to what's typed now.
  const results = trimmed && found?.query === trimmed ? found.items : null;

  useEffect(() => {
    if (!trimmed) return;
    const timer = setTimeout(() => {
      searchItems(db, parseQuery(trimmed))
        .then((items) => setFound({ query: trimmed, items }))
        .catch(() => setFound({ query: trimmed, items: [] }));
    }, 150);
    return () => clearTimeout(timer);
  }, [db, trimmed]);

  return (
    <TabList
      title="Search"
      data={results ?? []}
      renderItem={({ item }) => <ItemRow item={item} showType />}
      ListHeaderComponent={
        <View style={styles.header}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="sony, bills, due this week…"
            placeholderTextColor={theme.textSecondary}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          {!query ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
              {EXAMPLES.map((example) => (
                <Chip key={example} label={example} onPress={() => setQuery(example)} />
              ))}
            </ScrollView>
          ) : null}
        </View>
      }
      ListEmptyComponent={results ? <EmptyState title="No matches" message="Try a name, a type like “bills”, or “due this week”." /> : null}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  input: {
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  examples: {
    gap: Spacing.two,
  },
});
