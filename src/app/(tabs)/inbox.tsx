import { ItemRow } from '@/components/item-row';
import { TabList } from '@/components/screen';
import { EmptyState } from '@/components/ui';
import { useDbQuery } from '@/hooks/use-db-query';
import { listInbox } from '@/lib/db/items';

export default function InboxScreen() {
  const { data } = useDbQuery(listInbox);

  return (
    <TabList
      title="Inbox"
      subtitle="Everything you've shared, newest first"
      data={data ?? []}
      renderItem={({ item }) => <ItemRow item={item} showType />}
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
