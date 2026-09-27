import { overdueCutoff } from '../dates';

describe('Today overdue window', () => {
  it('keeps recent overdue items for 30 calendar days', () => {
    expect(overdueCutoff(new Date(2026, 8, 25, 15, 30))).toEqual(new Date(2026, 7, 26));
  });
});
