import { listOlderOverdue, listToday } from '@/lib/db/items';
const { execFileSync } = jest.requireActual<{ execFileSync: (command: string, args: string[], options: { encoding: 'utf8' }) => string }>('node:child_process');

jest.mock('expo-crypto', () => ({ randomUUID: () => 'test' }));

it('keeps old active obligations accessible without duplicating items already on Today', async () => {
  const now = new Date(2026, 8, 23, 10);
  const old = new Date(2026, 6, 1).getTime();
  const records = [
    ['old bill', 'active', old, null],
    ['old with current reminder', 'active', old, now.getTime()],
    ['completed bill', 'done', old, null],
    ['archived bill', 'archived', old, null],
    ['today', 'active', now.getTime(), null],
  ];
  const db = { getAllAsync: async (sql: string, ...params: unknown[]) => JSON.parse(execFileSync('python3', ['-c', `
import sqlite3,json,sys
rows,sql,params=json.loads(sys.argv[1])
c=sqlite3.connect(':memory:'); c.row_factory=sqlite3.Row
c.execute('CREATE TABLE items(id TEXT,status TEXT,due_at INTEGER,next_reminder_at INTEGER,fields TEXT,attachments TEXT)')
c.executemany("INSERT INTO items VALUES(?,?,?,?, '{}', '[]')", rows)
print(json.dumps([dict(r) for r in c.execute(sql,params)]))
`, JSON.stringify([records, sql, params])], { encoding: 'utf8' })) };
  expect((await listOlderOverdue(db as never, now)).map((item) => item.id)).toEqual(['old bill']);
  expect((await listToday(db as never, now)).map((item) => item.id)).toEqual(['old with current reminder', 'today']);
});
