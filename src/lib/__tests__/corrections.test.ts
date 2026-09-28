import { addToStats, correctionsOf, describeStats, statsOf } from '../corrections';

const read = { type: 'bill' as const, title: 'Electricity Bill', fields: { amount: 2100, dueDate: '2026-09-28' } };

describe('reading corrections', () => {
  it('lists what the person changed', () => {
    expect(correctionsOf(read, read)).toEqual([]);
    expect(correctionsOf(read, { ...read, title: 'BESCOM', fields: { amount: 2840, dueDate: '2026-09-28' } })).toEqual(['title', 'amount']);
    expect(correctionsOf(read, { ...read, type: 'task' })).toEqual(['type']);
  });

  it('keeps running totals', () => {
    let stats = statsOf(null);
    stats = addToStats(stats, []);
    stats = addToStats(stats, ['amount']);
    stats = addToStats(stats, ['amount', 'dueDate']);
    expect(stats).toEqual({ saved: 3, corrected: 2, fields: { amount: 2, dueDate: 1 } });
    expect(describeStats(stats)).toBe('1 of 3 saved without changes · most fixed: amount');
    expect(describeStats(statsOf('not json'))).toBeNull();
  });
});
