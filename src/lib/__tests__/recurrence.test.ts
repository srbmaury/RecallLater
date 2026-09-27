import { nextOccurrence } from '../recurrence';

// Wednesday, 23 Sep 2026, 10:00 local.
const NOW = new Date(2026, 8, 23, 10, 0);

describe('recurring items', () => {
  it('ignores items that do not repeat', () => {
    expect(nextOccurrence({ dueDate: '2026-09-28' }, NOW)).toBeNull();
    expect(nextOccurrence({ repeat: 'monthly' }, NOW)).toBeNull();
  });

  it('moves a monthly bill to the same day next month', () => {
    expect(nextOccurrence({ repeat: 'monthly', dueDate: '2026-09-28', amount: 2840 }, NOW)).toEqual({
      repeat: 'monthly',
      repeatDay: 28,
      dueDate: '2026-10-28',
      amount: 2840,
    });
  });

  it('clamps month ends and returns to the original day afterwards', () => {
    const jan = { repeat: 'monthly' as const, dueDate: '2027-01-31' };
    const feb = nextOccurrence(jan, NOW)!;
    expect(feb.dueDate).toBe('2027-02-28');
    const mar = nextOccurrence(feb, NOW)!;
    expect(mar.dueDate).toBe('2027-03-31');
    expect(nextOccurrence({ repeat: 'monthly', dueDate: '2028-01-31' }, NOW)!.dueDate).toBe('2028-02-29');
  });

  it('handles leap days yearly', () => {
    const leap = nextOccurrence({ repeat: 'yearly', dueDate: '2028-02-29' }, NOW)!;
    expect(leap.dueDate).toBe('2029-02-28');
    expect(nextOccurrence({ ...leap, dueDate: '2031-02-28' }, NOW)!.dueDate).toBe('2032-02-29');
  });

  it('keeps times and moves weekly events together', () => {
    expect(nextOccurrence({ repeat: 'weekly', startsAt: '2026-09-24T18:30' }, NOW)).toEqual({
      repeat: 'weekly',
      startsAt: '2026-10-01T18:30',
    });
  });

  it('skips missed occurrences instead of piling them up', () => {
    expect(nextOccurrence({ repeat: 'monthly', dueDate: '2026-06-05' }, NOW)!.dueDate).toBe('2026-10-05');
    expect(nextOccurrence({ repeat: 'weekly', dueDate: '2026-09-02' }, NOW)!.dueDate).toBe('2026-09-23'); // due today still counts
  });
});
