import { endOfDay } from '@/lib/dates';

import { parseQuery } from '../search';

const NOW = new Date(2026, 8, 23, 10, 0);

describe('parseQuery', () => {
  it('maps type words to filters', () => {
    expect(parseQuery('bills', NOW)).toMatchObject({ terms: [], types: ['bill'] });
    expect(parseQuery('upcoming trips', NOW).types).toEqual(['travel']);
  });

  it('keeps free words as search terms and includes finished items', () => {
    expect(parseQuery('sony', NOW)).toMatchObject({ terms: ['sony'], includeDone: true });
  });

  it('understands time windows', () => {
    const week = parseQuery('items due this week', NOW);
    expect(week.terms).toEqual([]);
    expect(week.dueBefore).toBe(endOfDay(new Date(2026, 8, 30)).getTime());

    const month = parseQuery('things expiring this month', NOW);
    expect(month.dueBefore).toBe(endOfDay(new Date(2026, 8, 30)).getTime());
    expect(month.includeDone).toBe(false);
    expect(month.dateField).toBe('expiry');

    expect(parseQuery('overdue bills', NOW)).toMatchObject({ types: ['bill'], dueBefore: NOW.getTime() });
  });
});
