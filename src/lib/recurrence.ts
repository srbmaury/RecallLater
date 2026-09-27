import { addDays, hasTime, parseLocalDateTime, startOfDay, toLocalDateTime } from '@/lib/dates';
import type { ExtractedFields, LocalDateTime, Repeat } from '@/lib/types';

export const REPEAT_LABELS: Record<Repeat, string> = { weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };

/** The dates that move with each occurrence. Return windows and coupon expiry belong to one purchase. */
const MOVING_DATES = ['dueDate', 'startsAt'] as const;

function daysIn(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** One step on from `date`, landing on `anchorDay` when the month has it. */
function step(date: Date, repeat: Repeat, anchorDay: number): Date {
  if (repeat === 'weekly') return addDays(date, 7);
  const year = date.getFullYear() + (repeat === 'yearly' ? 1 : 0);
  const month = date.getMonth() + (repeat === 'monthly' ? 1 : 0);
  const next = new Date(year, month, 1, date.getHours(), date.getMinutes());
  next.setDate(Math.min(anchorDay, daysIn(next.getFullYear(), next.getMonth())));
  return next;
}

/**
 * The fields of the next occurrence of a repeating item, or null if it doesn't repeat.
 * Dates move on by whole steps until they're no longer in the past, so marking a bill
 * done three months late creates next month's bill, not three stale ones.
 */
export function nextOccurrence(fields: ExtractedFields, now: Date): ExtractedFields | null {
  const { repeat } = fields;
  const keyName = fields.dueDate ? 'dueDate' : 'startsAt';
  const keyDate = fields[keyName];
  if (!repeat || !keyDate) return null;
  const anchorDay = fields.repeatDay ?? parseLocalDateTime(keyDate).getDate();

  const today = startOfDay(now);
  const key = parseLocalDateTime(keyDate);
  let steps = 0;
  for (let date = key; steps === 0 || date < today; steps++) date = step(date, repeat, anchorDay);

  const next: ExtractedFields = { ...fields, repeatDay: repeat === 'weekly' ? undefined : anchorDay };
  for (const name of MOVING_DATES) {
    const value: LocalDateTime | undefined = fields[name];
    if (!value) continue;
    let date = parseLocalDateTime(value);
    const day = name === keyName ? anchorDay : date.getDate();
    for (let i = 0; i < steps; i++) date = step(date, repeat, day);
    next[name] = toLocalDateTime(date, hasTime(value));
  }
  if (next.repeatDay === undefined) delete next.repeatDay;
  return next;
}
