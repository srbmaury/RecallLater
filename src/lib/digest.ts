import { endOfDay, startOfDay } from '@/lib/dates';

export const DIGEST_SETTING = 'morning_digest';
/** How many days of digests are queued ahead (topped up whenever the app opens). */
export const DIGEST_DAYS = 7;

type DigestItem = { title: string; dueAt: number | null };

/** "off", or the local time of day as "HH:mm". Nothing stored means off. */
export function digestTimeOf(value: string | null): string | null {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

/**
 * The digest for one day: items due that day, plus anything still overdue by then.
 * Returns null when there's nothing to say, so quiet days send nothing.
 */
export function buildDigest(items: DigestItem[], day: Date): { title: string; body: string } | null {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();
  const due = items.filter((i) => i.dueAt !== null && i.dueAt >= dayStart && i.dueAt <= dayEnd);
  const overdue = items.filter((i) => i.dueAt !== null && i.dueAt < dayStart);
  const count = due.length + overdue.length;
  if (!count) return null;

  const names = [...overdue, ...due].map((i) => i.title);
  const shown = names.slice(0, 3).join(' · ');
  const more = names.length > 3 ? ` · +${names.length - 3} more` : '';
  const title =
    due.length && overdue.length
      ? `${due.length} due today, ${overdue.length} overdue`
      : due.length
        ? `${due.length} ${due.length === 1 ? 'thing' : 'things'} today`
        : `${overdue.length} overdue`;
  return { title, body: `${shown}${more}` };
}
