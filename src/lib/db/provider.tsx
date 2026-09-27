import { defaultDatabaseDirectory, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import RecallNative from '../../../modules/recall-native';
import { attachmentsDirectoryUri } from '../attachments';

import { DATABASE_NAME, migrate } from './schema';

let opening: Promise<SQLiteDatabase> | null = null;

/**
 * The app's single database connection, opened and migrated once and never closed:
 * closing a connection aborts natively on Android with expo-sqlite 57, so nothing
 * in the app may close one (this includes `withExclusiveTransactionAsync`).
 */
function getDatabase(): Promise<SQLiteDatabase> {
  opening ??= openDatabaseAsync(DATABASE_NAME)
    .then(async (db) => {
      await migrate(db);
      // "Stored on this device" must hold on iOS too, where Documents is in iCloud backups.
      // Best effort: never let this block opening the app.
      await Promise.all(
        [defaultDatabaseDirectory, attachmentsDirectoryUri()].map((path) =>
          Promise.resolve()
            .then(() => RecallNative.excludeFromBackupAsync(path))
            .catch(console.warn),
        ),
      );
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
