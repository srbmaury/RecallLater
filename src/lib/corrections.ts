import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from '@/lib/db/items';
import type { ExtractedFields, ItemType } from '@/lib/types';

/** How often what the app read had to be fixed before saving. Kept on this phone only. */
export const STATS_SETTING = 'reading_stats';

export type ReadingStats = { saved: number; corrected: number; fields: Record<string, number> };
type Reading = { type: ItemType; title: string; fields: ExtractedFields };

const CHECKED_FIELDS = ['amount', 'dueDate', 'startsAt', 'expiresOn', 'returnBy', 'couponCode', 'pnr'] as const;

/** What the person changed between the app's reading and what they saved. */
export function correctionsOf(read: Reading, saved: Reading): string[] {
  const changed: string[] = [];
  if (read.type !== saved.type) changed.push('type');
  if (read.title.trim() !== saved.title.trim()) changed.push('title');
  for (const key of CHECKED_FIELDS) {
    if (read.fields[key] !== saved.fields[key]) changed.push(key);
  }
  return changed;
}

export function addToStats(stats: ReadingStats, changed: string[]): ReadingStats {
  const fields = { ...stats.fields };
  for (const key of changed) fields[key] = (fields[key] ?? 0) + 1;
  return { saved: stats.saved + 1, corrected: stats.corrected + (changed.length ? 1 : 0), fields };
}

export function statsOf(value: string | null): ReadingStats {
  try {
    const parsed = value ? (JSON.parse(value) as Partial<ReadingStats>) : {};
    return { saved: parsed.saved ?? 0, corrected: parsed.corrected ?? 0, fields: parsed.fields ?? {} };
  } catch {
    return { saved: 0, corrected: 0, fields: {} };
  }
}

export async function recordCorrections(db: SQLiteDatabase, read: Reading, saved: Reading): Promise<void> {
  const stats = statsOf(await getSetting(db, STATS_SETTING));
  await setSetting(db, STATS_SETTING, JSON.stringify(addToStats(stats, correctionsOf(read, saved))));
}

const FIELD_NAMES: Record<string, string> = {
  type: 'type',
  title: 'title',
  amount: 'amount',
  dueDate: 'due date',
  startsAt: 'date',
  expiresOn: 'expiry',
  returnBy: 'return date',
  couponCode: 'code',
  pnr: 'PNR',
};

/** "18 of 20 saved without changes · most fixed: due date". */
export function describeStats(stats: ReadingStats): string | null {
  if (!stats.saved) return null;
  const clean = stats.saved - stats.corrected;
  const [top] = Object.entries(stats.fields).sort((a, b) => b[1] - a[1]);
  const most = top ? ` · most fixed: ${FIELD_NAMES[top[0]] ?? top[0]}` : '';
  return `${clean} of ${stats.saved} saved without changes${most}`;
}
