import { addDays, atTime } from '@/lib/dates';

export type SnoozeOption = { key: 'hour' | 'tonight' | 'tomorrow'; label: string; until: Date };

/** An hour from now, rounded up to the next 5 minutes so reminders land on tidy times. */
export function inAnHour(now: Date): Date {
  const next = new Date(now.getTime() + 3_600_000);
  const minutes = Math.ceil(next.getMinutes() / 5) * 5;
  next.setMinutes(minutes, 0, 0);
  return next;
}

export function tomorrowMorning(now: Date): Date {
  return atTime(addDays(now, 1), 9);
}

/**
 * The quick "Later" choices. "Tonight" is offered only while there's still a useful gap
 * before 7 PM; late in the evening it would be the same as an hour from now.
 */
export function snoozeOptions(now: Date): SnoozeOption[] {
  const tonight = atTime(now, 19);
  return [
    { key: 'hour', label: 'In 1 hour', until: inAnHour(now) },
    ...(tonight.getTime() - now.getTime() >= 2 * 3_600_000 ? [{ key: 'tonight' as const, label: 'Tonight 7 PM', until: tonight }] : []),
    { key: 'tomorrow', label: 'Tomorrow 9 AM', until: tomorrowMorning(now) },
  ];
}
