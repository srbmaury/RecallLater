import { buildTodayGlance } from '../glance';
import type { Item } from '../types';

const NOW = new Date(2026, 8, 23, 10, 0);
const at = (d: number, h = 0, m = 0) => new Date(2026, 8, d, h, m).getTime();
const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  type: 'bill',
  title: id,
  status: 'active',
  sourceType: 'text',
  extractedText: '',
  fields: { dueDate: '2026-09-23' },
  attachments: [],
  confidence: 1,
  dueAt: at(23),
  reminderMode: 'none',
  nextReminderAt: null,
  createdAt: 0,
  updatedAt: 0,
  completedAt: null,
  ...over,
});

describe('today widget', () => {
  it('says so when the day is clear', () => {
    expect(buildTodayGlance([], NOW, false)).toEqual({ headline: 'Nothing due today', rows: [], more: 0 });
  });

  it('lists the next items with when they are due', () => {
    const glance = buildTodayGlance(
      [
        item('Water bill', { dueAt: at(21), fields: { dueDate: '2026-09-21' } }),
        item('Rent'),
        item('Standup', { type: 'event', fields: { startsAt: '2026-09-23T15:30' }, dueAt: at(23, 15, 30) }),
        item('Call bank', { dueAt: null, fields: {}, nextReminderAt: at(23, 18) }),
      ],
      NOW,
      false,
    );
    expect(glance.headline).toBe('3 today · 1 overdue');
    expect(glance.rows.map((r) => [r.title, r.when.replace(/\s/g, ' ')])).toEqual([
      ['Water bill', 'Overdue'],
      ['Rent', 'Today'],
      ['Standup', expect.stringMatching(/3:30/)],
    ]);
    expect(glance.more).toBe(1);
  });

  it('shows only counts while App lock is on', () => {
    expect(buildTodayGlance([item('Rent')], NOW, true)).toEqual({ headline: '1 today', rows: [], more: 0 });
  });
});
