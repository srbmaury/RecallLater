import { buildBackup, itemsToRestore, parseBackup, resumeReminderAt } from '../backup';
import type { Item } from '../types';

const NOW = new Date(2026, 8, 23, 10, 0);
const at = (d: number, h: number) => new Date(2026, 8, d, h).getTime();

const item = (over: Partial<Item> = {}): Item => ({
  id: 'a',
  type: 'bill',
  title: 'Electricity Bill',
  status: 'active',
  sourceType: 'image',
  extractedText: 'Electricity Bill ₹2,840',
  fields: { amount: 2840, dueDate: '2026-09-28' },
  attachments: ['a.jpg'],
  confidence: 0.9,
  dueAt: at(28, 0),
  reminderMode: 'until_done',
  nextReminderAt: at(27, 19),
  createdAt: at(20, 9),
  updatedAt: at(20, 9),
  completedAt: null,
  ...over,
});

describe('backup', () => {
  it('round-trips items, portable settings and files', () => {
    const backup = buildBackup(
      [item()],
      { ai_understanding: 'ask', morning_digest: '08:30', morning_digest_ids: '["x"]' },
      { 'a.jpg': 'AAAA' },
      NOW,
    );
    const restored = parseBackup(JSON.stringify(backup));
    expect(restored.items).toEqual([item()]);
    expect(restored.settings).toEqual({ ai_understanding: 'ask', morning_digest: '08:30' });
    expect(restored.files).toEqual({ 'a.jpg': 'AAAA' });
  });

  it('rejects files that are not backups, or from a newer app', () => {
    expect(() => parseBackup('hello')).toThrow('isn’t a RecallLater backup');
    expect(() => parseBackup('{"items":[]}')).toThrow('isn’t a RecallLater backup');
    expect(() => parseBackup('{"app":"recalllater","version":99,"items":[]}')).toThrow('newer version');
  });

  it('drops malformed items instead of failing the whole restore', () => {
    const text = JSON.stringify({ app: 'recalllater', version: 1, items: [item(), { id: 'b' }, { ...item({ id: 'c' }), type: 'spaceship' }] });
    expect(parseBackup(text).items.map((i) => i.id)).toEqual(['a']);
  });

  it('merges without duplicates', () => {
    const backup = buildBackup([item(), item({ id: 'b', title: 'Rent', fields: { amount: 25000, dueDate: '2026-10-05' }, dueAt: at(5, 0) })], {}, {}, NOW);
    expect(itemsToRestore(backup, [item()]).map((i) => i.id)).toEqual(['b']);
    // Shared again on this phone under a new id: still the same bill.
    expect(itemsToRestore(backup, [item({ id: 'z' })]).map((i) => i.id)).toEqual(['b']);
    expect(itemsToRestore(backup, [])).toHaveLength(2);
  });

  it('resumes reminders sensibly', () => {
    expect(resumeReminderAt(item(), NOW)).toEqual(new Date(at(27, 19)));
    // Until done: the missed nudge moves to the next day at the same time.
    expect(resumeReminderAt(item({ nextReminderAt: at(21, 19) }), NOW)).toEqual(new Date(at(23, 19)));
    expect(resumeReminderAt(item({ reminderMode: 'once', nextReminderAt: at(21, 19) }), NOW)).toBeNull();
    expect(resumeReminderAt(item({ status: 'done' }), NOW)).toBeNull();
  });
});

it.each(['../SQLite/recalllater.db', '/tmp/bill.jpg', 'folder/bill.jpg', '..\\bill.jpg', '.', '..', '%2e%2e%2fbill.jpg', 'file:///bill.jpg', ''])('rejects unsafe attachment name %s before restoring any item', (name) => {
  const backup = buildBackup([item({ attachments: [name] })], {}, {}, NOW);
  expect(() => parseBackup(JSON.stringify(backup))).toThrow('attachment');
});

it('rejects unsafe file keys even when no item references them', () => {
  const backup = buildBackup([], {}, { '../database.db': 'AAAA' }, NOW);
  expect(() => parseBackup(JSON.stringify(backup))).toThrow('attachment');
});
