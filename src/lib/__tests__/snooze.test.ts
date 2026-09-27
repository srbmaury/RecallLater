import { toLocalDateTime } from '@/lib/dates';

import { inAnHour, snoozeOptions, tomorrowMorning } from '../snooze';

const at = (h: number, m = 0) => new Date(2026, 8, 23, h, m);

describe('snooze', () => {
  it('rounds "in 1 hour" up to the next 5 minutes', () => {
    expect(toLocalDateTime(inAnHour(at(10, 2)))).toBe('2026-09-23T11:05');
    expect(toLocalDateTime(inAnHour(at(10, 56)))).toBe('2026-09-23T12:00');
    expect(toLocalDateTime(inAnHour(at(23, 30)))).toBe('2026-09-24T00:30');
  });

  it('means 9 AM the next day by "tomorrow"', () => {
    expect(toLocalDateTime(tomorrowMorning(at(23, 50)))).toBe('2026-09-24T09:00');
  });

  it('offers "tonight" only with at least two hours to go', () => {
    expect(snoozeOptions(at(10)).map((o) => o.key)).toEqual(['hour', 'tonight', 'tomorrow']);
    expect(snoozeOptions(at(17, 30)).map((o) => o.key)).toEqual(['hour', 'tomorrow']);
    expect(snoozeOptions(at(21)).map((o) => o.key)).toEqual(['hour', 'tomorrow']);
  });
});
