import type { LocalDateTime } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalDateTime(date: Date, withTime = true): LocalDateTime {
  const key = toDateKey(date);
  return withTime ? `${key}T${pad(date.getHours())}:${pad(date.getMinutes())}` : key;
}

export function hasTime(value: LocalDateTime): boolean {
  return value.includes('T');
}

/** Parses a zone-less local date/time into a `Date` in the device's time zone. */
export function parseLocalDateTime(value: LocalDateTime): Date {
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart ? timePart.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Old due dates stay searchable in Inbox but stop crowding the Today action list after 30 days. */
export function overdueCutoff(now: Date): Date {
  return startOfDay(addDays(now, -30));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), date.getHours(), date.getMinutes());
  // 31 Jan + 1 month rolls into March; clamp to the last day of the target month.
  if (next.getDate() !== date.getDate()) next.setDate(0);
  return next;
}

export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

export function atTime(date: Date, hours: number, minutes = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

export function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Whole calendar days from `from` to `to` (negative when `to` is in the past). */
function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export function formatDay(date: Date, now = new Date()): string {
  const diff = dayDiff(now, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatLocalDateTime(value: LocalDateTime, now = new Date()): string {
  const date = parseLocalDateTime(value);
  return hasTime(value) ? `${formatDay(date, now)} · ${formatTime(date)}` : formatDay(date, now);
}
