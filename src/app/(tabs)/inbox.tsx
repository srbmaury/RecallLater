import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AddButton } from '@/components/add-sheet';
import { ItemRow } from '@/components/item-row';
import { TabList } from '@/components/screen';
import { Button, Card, EmptyState } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useDbQuery } from '@/hooks/use-db-query';
import { listInbox } from '@/lib/db/items';

export default function InboxScreen() {
  const { saved, outcome, savedAt } = useLocalSearchParams<{ saved?: string; outcome?: string; savedAt?: string }>();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const confirmation = `${savedAt}:${saved}:${outcome}`;
  const { data } = useDbQuery(listInbox);

  return (
    <TabList
      action={<AddButton />}
      title="Inbox"
      subtitle="Everything you've shared, newest first"
      data={data ?? []}
      renderItem={({ item }) => <ItemRow item={item} showType />}
      ListHeaderComponent={saved && outcome && dismissed !== confirmation ? (
        <Card>
          <ThemedText type="heading">{outcome}</ThemedText>
          <Button label="Edit saved item" variant="plain" size="small" onPress={() => {
            setDismissed(confirmation);
            router.push({ pathname: '/item/[id]', params: { id: saved } });
          }} />
          <Button label="Dismiss confirmation" variant="plain" size="small" onPress={() => setDismissed(confirmation)} />
        </Card>
      ) : null}
      ListEmptyComponent={
        data ? (
          <EmptyState
            title="Your inbox is empty"
            message={'In any app, tap Share and pick RecallLater.\nScreenshots, PDFs, links and text all work.'}
          />
        ) : null
      }
    />
  );
}
