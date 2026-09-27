import { endOfDay, hasTime, startOfDay } from '@/lib/dates';
import { keyDateOf } from '@/lib/parse';
import type { Item } from '@/lib/types';

type GlanceRow = { id: string; title: string; when: string };
export type TodayGlance = { headline: string; rows: GlanceRow[]; more: number };

const ROWS = 3;

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function whenOf(item: Item, now: Date): string {
  const dayStart = startOfDay(now).getTime();
  if (item.dueAt !== null && item.dueAt < dayStart) return 'Overdue';
  if (item.dueAt !== null && item.dueAt <= endOfDay(now).getTime()) {
    const key = keyDateOf(item.fields);
    return key && hasTime(key) ? timeOf(item.dueAt) : 'Today';
  }
  return item.nextReminderAt !== null ? `⏰ ${timeOf(item.nextReminderAt)}` : '';
}

/**
 * What the home-screen widget says about today. With App lock on it shows only counts:
 * a locked app shouldn't list what's in it on the home screen.
 */
export function buildTodayGlance(items: Item[], now: Date, locked: boolean): TodayGlance {
  const dayStart = startOfDay(now).getTime();
  const overdue = items.filter((item) => item.dueAt !== null && item.dueAt < dayStart).length;
  const today = items.length - overdue;
  const headline = !items.length
    ? 'Nothing due today'
    : [today && `${today} today`, overdue && `${overdue} overdue`].filter(Boolean).join(' · ');
  if (locked) return { headline, rows: [], more: 0 };
  return {
    headline,
    rows: items.slice(0, ROWS).map((item) => ({ id: item.id, title: item.title, when: whenOf(item, now) })),
    more: Math.max(0, items.length - ROWS),
  };
}
