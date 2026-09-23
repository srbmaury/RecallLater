import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'recalllater.db';

// Each entry upgrades the schema by one `user_version`. Never edit a shipped step; append.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE items (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    source_type TEXT NOT NULL,
    extracted_text TEXT NOT NULL DEFAULT '',
    fields TEXT NOT NULL DEFAULT '{}',
    attachments TEXT NOT NULL DEFAULT '[]',
    confidence REAL NOT NULL DEFAULT 0,
    due_at INTEGER,
    reminder_mode TEXT NOT NULL DEFAULT 'none',
    next_reminder_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX items_status_due ON items (status, due_at);
  CREATE INDEX items_type ON items (type, status);

  -- One row per scheduled OS notification, so they can be cancelled and topped up.
  CREATE TABLE reminders (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    fire_at INTEGER NOT NULL,
    notification_id TEXT
  );
  CREATE INDEX reminders_item ON reminders (item_id, fire_at);

  CREATE VIRTUAL TABLE items_fts USING fts5 (
    title, extracted_text, content = 'items', content_rowid = 'rowid', tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN
    INSERT INTO items_fts (rowid, title, extracted_text) VALUES (new.rowid, new.title, new.extracted_text);
  END;
  CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
    INSERT INTO items_fts (items_fts, rowid, title, extracted_text) VALUES ('delete', old.rowid, old.title, old.extracted_text);
  END;
  CREATE TRIGGER items_fts_update AFTER UPDATE OF title, extracted_text ON items BEGIN
    INSERT INTO items_fts (items_fts, rowid, title, extracted_text) VALUES ('delete', old.rowid, old.title, old.extracted_text);
    INSERT INTO items_fts (rowid, title, extracted_text) VALUES (new.rowid, new.title, new.extracted_text);
  END;

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(MIGRATIONS[version]);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version += 1;
  }
}
