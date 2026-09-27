import type { ReactNode } from 'react';
import { FlatList, type ListRenderItem, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type HeaderProps = { title: string; subtitle?: string; action?: ReactNode };

function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <ThemedText type="title" style={styles.title}>
          {title}
        </ThemedText>
        {action}
      </View>
      {subtitle ? (
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A tab screen: large title header followed by scrollable content. */
export function TabScreen({ children, ...header }: HeaderProps & { children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Header {...header} />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function TabList<T extends { id: string }>({
  data,
  renderItem,
  ListEmptyComponent,
  ListHeaderComponent,
  ...header
}: HeaderProps & {
  data: T[];
  renderItem: ListRenderItem<T>;
  ListEmptyComponent?: ReactNode;
  ListHeaderComponent?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <Header {...header} />
            {ListHeaderComponent}
          </>
        }
        ListEmptyComponent={<>{ListEmptyComponent}</>}
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six * 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
  },
  header: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  separator: {
    height: Spacing.two,
  },
});
