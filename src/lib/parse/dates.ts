import { addDays, isValidDate, startOfDay, toDateKey } from '@/lib/dates';

export type DateLabel = 'due' | 'expiry' | 'departure' | 'arrival' | 'purchase' | 'return' | 'warranty' | 'range' | 'none';

export type DateMatch = {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:mm`, when a time was printed next to the date. */
  time?: string;
  index: number;
  end: number;
  raw: string;
  /** What the surrounding words say this date is for. */
  label: DateLabel;
  relative: boolean;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const ISO = /\b(20\d{2})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2}))?\b/g;
const NUMERIC = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/g;
// A 2-digit "year" followed by `:` is really an hour ("5 Mar 10:30").
const DAY_MONTH = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]*(?:of\\s+)?${MONTH}\\.?(?:,?[\\s-]*(\\d{4}|'?\\d{2})(?![:.]?\\d)(?![ \\t]*[A-Za-z]{3}))?\\b`,
  'gi',
);
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:.]\\d)(?:,?\\s*(\\d{4})\\b)?`, 'gi');
const RELATIVE_DAY = /\b(day after tomorrow|today|tonight|tomorrow|tmrw)\b/gi;
const RELATIVE_OFFSETS: Record<string, number> = {
  today: 0, tonight: 0, tomorrow: 1, tmrw: 1, 'day after tomorrow': 2,
};
const WEEKDAY = /\b(?:(this|next|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
const IN_N = /\bin\s+(\d{1,2})\s+(day|week)s?\b/gi;

const TIME_COLON = /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(am|pm|a\.m\.|p\.m\.))?/gi;
const TIME_MERIDIEM = /\b(1[0-2]|0?[1-9])(?:\.([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/gi;

const LABEL_PATTERNS: [DateLabel, RegExp][] = [
  ['return', /return(?:\s+(?:deadline|window|by|until|eligible(?:\s+until)?))?/g],
  ['warranty', /warranty\s*(?:until|till|upto|up to|valid(?: till| until)?|expires|ends)/g],
  ['expiry', /expir|valid\s*(?:till|until|upto|up to|thru)|use by|best before|offer ends|ends on/g],
  ['due', /\bdue\b|pay by|payable by|last date|deadline|before|submit by|\bby\s*$/g],
  ['departure', /depart|\bdep\b|journey|boarding|travel date|flight date|check-?\s?in|scheduled/g],
  ['arrival', /arriv|\barr\b|check-?\s?out/g],
  ['purchase', /invoice|order(?:ed)?\s*(?:date|on)|bill(?:ing)? date|statement date|issue date|purchase|dated|transaction|txn|paid on|placed on/g],
];

/**
 * Finds every date in `text`, resolved against `now`. Numeric dates are read day-first
 * (India / most of the world) unless that is impossible.
 */
export function findDates(text: string, now: Date): DateMatch[] {
  const today = startOfDay(now);
  const found: Omit<DateMatch, 'label'>[] = [];
  const add = (date: Date | null, index: number, raw: string, relative: boolean, time?: string) => {
    if (!date) return;
    found.push({ date: toDateKey(date), index, end: index + raw.length, raw, relative, ...(time && { time }) });
  };

  for (const m of text.matchAll(ISO)) {
    const time = m[4] ? `${m[4]}:${m[5]}` : undefined;
    add(build(+m[1], +m[2], +m[3]), m.index, m[0], false, time);
  }
  for (const m of text.matchAll(NUMERIC)) {
    let [day, month] = [+m[1], +m[2]];
    if (month > 12 && day <= 12) [day, month] = [month, day];
    add(build(normalizeYear(m[3]), month, day), m.index, m[0], false);
  }
  for (const m of text.matchAll(DAY_MONTH)) {
    add(resolveYear(+m[1], monthOf(m[2]), m[3], today), m.index, m[0], false);
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    add(resolveYear(+m[2], monthOf(m[1]), m[3], today), m.index, m[0], false);
  }
  for (const m of text.matchAll(RELATIVE_DAY)) {
    add(addDays(today, RELATIVE_OFFSETS[m[1].toLowerCase()]), m.index, m[0], true);
  }
  for (const m of text.matchAll(WEEKDAY)) {
    const target = WEEKDAYS.indexOf(m[2].toLowerCase());
    // "Friday" said on a Friday means next week's.
    const ahead = (target - today.getDay() + 7) % 7 || 7;
    add(addDays(today, ahead), m.index, m[0], true);
  }
  for (const m of text.matchAll(IN_N)) {
    const days = +m[1] * (m[2].toLowerCase() === 'week' ? 7 : 1);
    add(addDays(today, days), m.index, m[0], true);
  }

  const kept = dropOverlaps(found);
  const withoutEchoes = kept.filter(
    // "Friday, 25 Sep": the weekday just restates the absolute date next to it.
    (match) => !match.relative || !kept.some((other) => !other.relative && Math.abs(other.index - match.end) < 15),
  );
  const times = findTimes(text);
  return withoutEchoes.map((match) => ({
    ...match,
    time: match.time ?? nearestTime(text, match, times) ?? adjacentLineTime(text, match),
    // "01 Sep - 30 Sep 2026" is a billing period, not a deadline.
    label: isRange(text, match, withoutEchoes) ? 'range' : labelFor(text, match.index),
  }));
}

type TimeMatch = { time: string; index: number; end: number };

export function findTimes(text: string): TimeMatch[] {
  const times: TimeMatch[] = [];
  for (const m of text.matchAll(TIME_COLON)) {
    times.push({ time: toClock(+m[1], +m[2], m[3]), index: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(TIME_MERIDIEM)) {
    const overlaps = times.some((t) => m.index < t.end && t.index < m.index + m[0].length);
    if (!overlaps) {
      times.push({ time: toClock(+m[1], m[2] ? +m[2] : 0, m[3]), index: m.index, end: m.index + m[0].length });
    }
  }
  return times.sort((a, b) => a.index - b.index);
}

function nearestTime(text: string, match: { index: number; end: number }, times: TimeMatch[]): string | undefined {
  const lineStart = text.lastIndexOf('\n', match.index - 1) + 1;
  const nextBreak = text.indexOf('\n', match.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  let best: TimeMatch | undefined;
  let bestDistance = Infinity;
  for (const t of times) {
    if (t.index < lineStart || t.end > lineEnd) continue;
    if (t.index < match.end && match.index < t.end) continue;
    const distance = t.index >= match.end ? t.index - match.end : match.index - t.end;
    const limit = t.index >= match.end ? 30 : 20;
    if (distance <= limit && distance < bestDistance) {
      best = t;
      bestDistance = distance;
    }
  }
  return best?.time;
}

/**
 * Posters and tickets often print the time on its own line right below (or above)
 * the date: "SATURDAY 03 OCTOBER" / "5:30 PM", "06:20  09:05" / "25 Sep 2026".
 * The first time on such a line is the start.
 */
function adjacentLineTime(text: string, match: { index: number; end: number }): string | undefined {
  const lines = text.split('\n');
  let offset = 0;
  let lineIndex = 0;
  for (; lineIndex < lines.length; lineIndex++) {
    if (match.index < offset + lines[lineIndex].length + 1) break;
    offset += lines[lineIndex].length + 1;
  }
  for (const neighbour of [lines[lineIndex + 1], lines[lineIndex - 1]]) {
    if (neighbour && /^\s*(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:am|pm))?(?:\s*(?:\t|→|-|–)\s*.*)?$/i.test(neighbour)) {
      return findTimes(neighbour)[0]?.time;
    }
  }
  return undefined;
}

function isRange(text: string, match: { index: number; end: number }, all: { index: number; end: number }[]): boolean {
  return all.some((other) => {
    if (other === match) return false;
    const between = other.index >= match.end ? text.slice(match.end, other.index) : text.slice(other.end, match.index);
    return /^\s*(?:-|–|—|to|till|until)\s*$/i.test(between);
  });
}

function labelFor(text: string, index: number): DateLabel {
  // Prefer labels on the same OCR row. Looking back a fixed number of characters
  // can mix adjacent columns ("PURCHASE DATE | WARRANTY UNTIL") and attach the
  // warranty label to the purchase date. Fall back to the preceding row only when
  // the current row has no text ("Due Date\n28/09/2026").
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const sameLine = text.slice(lineStart, index).trim();
  const previousLines = text.slice(Math.max(0, lineStart - 120), lineStart).split('\n').slice(-2).join(' ');
  const context = (sameLine || previousLines).toLowerCase();
  let best: DateLabel = 'none';
  let bestPosition = -1;
  for (const [label, pattern] of LABEL_PATTERNS) {
    for (const m of context.matchAll(pattern)) {
      const position = m.index + m[0].length;
      if (position > bestPosition) {
        best = label;
        bestPosition = position;
      }
    }
  }
  return best;
}

function dropOverlaps<T extends { index: number; end: number }>(matches: T[]): T[] {
  const byLength = [...matches].sort((a, b) => b.end - b.index - (a.end - a.index) || a.index - b.index);
  const kept: T[] = [];
  for (const match of byLength) {
    if (!kept.some((k) => match.index < k.end && k.index < match.end)) kept.push(match);
  }
  return kept.sort((a, b) => a.index - b.index);
}

function toClock(hours: number, minutes: number, meridiem?: string): string {
  const m = meridiem?.toLowerCase().replace(/\./g, '');
  let h = hours;
  if (m === 'pm' && h < 12) h += 12;
  if (m === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function monthOf(name: string): number {
  return MONTH_INDEX[name.slice(0, 3).toLowerCase()];
}

function normalizeYear(raw: string): number {
  const digits = raw.replace("'", '');
  return digits.length === 2 ? 2000 + Number(digits) : Number(digits);
}

function build(year: number, month: number, day: number): Date | null {
  return isValidDate(year, month, day) ? new Date(year, month - 1, day) : null;
}

/** A date printed without a year is this year's, unless that was more than two months ago. */
function resolveYear(day: number, month: number, rawYear: string | undefined, today: Date): Date | null {
  if (rawYear) return build(normalizeYear(rawYear), month, day);
  const thisYear = build(today.getFullYear(), month, day);
  if (!thisYear) return null;
  return thisYear.getTime() < addDays(today, -60).getTime() ? build(today.getFullYear() + 1, month, day) : thisYear;
}
