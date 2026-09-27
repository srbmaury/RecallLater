import { addDays, endOfDay, startOfDay } from '@/lib/dates';
import type { SearchFilters } from '@/lib/db/items';
import type { ItemType } from '@/lib/types';

const TYPE_WORDS: Record<string, ItemType> = {
  bill: 'bill', bills: 'bill', payment: 'bill', payments: 'bill',
  task: 'task', tasks: 'task', todo: 'task', todos: 'task', message: 'task', messages: 'task',
  event: 'event', events: 'event',
  trip: 'travel', trips: 'travel', travel: 'travel', flight: 'travel', flights: 'travel', train: 'travel', trains: 'travel', ticket: 'travel', tickets: 'travel',
  receipt: 'receipt', receipts: 'receipt', invoice: 'receipt', invoices: 'receipt', order: 'receipt', orders: 'receipt', warranty: 'receipt',
  buy: 'purchase', product: 'purchase', products: 'purchase', shopping: 'purchase', wishlist: 'purchase',
  job: 'job', jobs: 'job', role: 'job', roles: 'job', applications: 'job',
  coupon: 'coupon', coupons: 'coupon', offer: 'coupon', offers: 'coupon', code: 'coupon', codes: 'coupon', deals: 'coupon',
  place: 'place', places: 'place', restaurant: 'place', restaurants: 'place', cafe: 'place', cafes: 'place', food: 'place',
  book: 'book', books: 'book', reading: 'book', read: 'book',
  movie: 'watch', movies: 'watch', show: 'watch', shows: 'watch', watchlist: 'watch', watch: 'watch',
  recipe: 'recipe', recipes: 'recipe', cook: 'recipe', cooking: 'recipe',
};

const STOP_WORDS = new Set(['things', 'items', 'stuff', 'my', 'all', 'the', 'due', 'expiring', 'upcoming', 'later']);

/**
 * Understands the small vocabulary people actually type: a type ("bills"), a time
 * window ("due this week", "expiring this month", "overdue") and free words.
 */
export function parseQuery(query: string, now = new Date()): SearchFilters {
  let rest = ` ${query.toLowerCase()} `;
  const filters: SearchFilters = { terms: [] };

  if (/\b(?:expiring|expiry|expires)\b/.test(rest)) {
    filters.dateField = 'expiry';
    rest = rest.replace(/\b(?:expiring|expiry|expires)\b/g, ' ');
  } else if (/\b(?:return|returns)\b/.test(rest)) {
    filters.dateField = 'return';
    rest = rest.replace(/\b(?:return|returns)\b/g, ' ');
  } else if (/\bwarrant(?:y|ies)\b/.test(rest)) {
    filters.dateField = 'warranty';
    rest = rest.replace(/\bwarrant(?:y|ies)\b/g, ' ');
  }

  const windows: [RegExp, () => Partial<SearchFilters>][] = [
    [/\boverdue\b/, () => ({ dueBefore: now.getTime() })],
    [/\btoday\b/, () => ({ dueAfter: startOfDay(now).getTime(), dueBefore: endOfDay(now).getTime() })],
    [/\btomorrow\b/, () => ({ dueAfter: startOfDay(addDays(now, 1)).getTime(), dueBefore: endOfDay(addDays(now, 1)).getTime() })],
    [/\b(?:this|next 7 days|in a) week\b/, () => ({ dueAfter: startOfDay(now).getTime(), dueBefore: endOfDay(addDays(now, 7)).getTime() })],
    [/\bthis month\b/, () => ({
      dueAfter: startOfDay(now).getTime(),
      dueBefore: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)).getTime(),
    })],
    [/\b(?:upcoming|soon)\b/, () => ({ dueAfter: now.getTime(), dueBefore: endOfDay(addDays(now, 30)).getTime() })],
  ];
  for (const [pattern, range] of windows) {
    if (pattern.test(rest)) {
      Object.assign(filters, range());
      rest = rest.replace(pattern, ' ');
    }
  }

  const types = new Set<ItemType>();
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    const type = TYPE_WORDS[word];
    if (type) types.add(type);
    else if (!STOP_WORDS.has(word) && word.length > 1) filters.terms.push(word);
  }
  if (types.size) filters.types = [...types];
  // Searching by name should also find finished items.
  filters.includeDone = filters.terms.length > 0 && !filters.dueAfter && !filters.dueBefore;
  return filters;
}
