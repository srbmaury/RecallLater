import { useFocusEffect } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { useDatabase } from '@/lib/db/provider';

/**
 * Runs `query` whenever the screen gains focus, so lists reflect changes made on
 * other screens (or from a notification action) without a global store.
 * Pass a module-level function so it stays stable across renders.
 */
export function useDbQuery<T, A = undefined>(query: (db: SQLiteDatabase, arg: A) => Promise<T>, arg?: A) {
  const db = useDatabase();
  const [data, setData] = useState<T | undefined>(undefined);

  const reload = useCallback(() => query(db, arg as A).then(setData), [db, query, arg]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, reload, db };
}
