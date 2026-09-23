import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { DATABASE_NAME, migrate } from './schema';

let opening: Promise<SQLiteDatabase> | null = null;

/**
 * The app's single database connection, opened and migrated once and never closed.
 * (expo-sqlite's `SQLiteProvider` closes the connection on unmount, which crashes
 * natively on Android SDK 57 when a remount or reload races the close.)
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  opening ??= openDatabaseAsync(DATABASE_NAME)
    .then(async (db) => {
      await migrate(db);
      return db;
    })
    .catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}

const DatabaseContext = createContext<SQLiteDatabase | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    getDatabase().then(setDb, setError);
  }, []);

  if (error) throw error;
  if (!db) return null;
  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): SQLiteDatabase {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDatabase must be used inside <DatabaseProvider>');
  return db;
}
