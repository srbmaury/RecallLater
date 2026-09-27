import type { ItemType, Repeat } from '@/lib/types';

// Only obligations and plans repeat; "No-cost EMI" on a product page or "₹30 LPA per year"
// on a job post describe the thing, not a schedule.
const REPEATING_TYPES: ItemType[] = ['bill', 'task', 'event'];

const WEEKLY = /\b(?:every|each|per)\s+week\b|\bweekly\b|\/\s?(?:week|wk)\b/i;
const YEARLY = /\b(?:every|each|per)\s+year\b|\b(?:yearly|annually)\b|\bannual\s+(?:fee|subscription|premium|plan|membership|renewal)\b|\/\s?(?:year|yr)\b/i;
const MONTHLY = /\b(?:every|each|per)\s+month\b|\bmonthly\b|\/\s?(?:month|mo)\b|\b(?:rent|emi|sip|subscription)\b/i;

/** Whether the text describes something that comes back on a schedule. */
export function findRepeat(type: ItemType, text: string): Repeat | undefined {
  if (!REPEATING_TYPES.includes(type)) return undefined;
  if (WEEKLY.test(text)) return 'weekly';
  if (YEARLY.test(text)) return 'yearly';
  if (MONTHLY.test(text)) return 'monthly';
  return undefined;
}
