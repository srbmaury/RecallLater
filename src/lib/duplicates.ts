import type { ExtractedFields, ItemType } from '@/lib/types';

export type Candidate = { type: ItemType; title: string; fields: ExtractedFields; dueAt: number | null };

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9₹]+/g, '');

/** A link without tracking parameters or fragments, so re-shared links still match. */
export function canonicalUrl(url: string): string {
  const [base] = url.split(/[?#]/);
  return base.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
}

/** Identifiers that can only belong to one thing: the same code / PNR / order is the same item. */
function strongKeys(c: Candidate): string[] {
  const f = c.fields;
  return [
    f.couponCode && `code:${norm(f.couponCode)}`,
    f.pnr && `pnr:${norm(f.pnr)}`,
    f.orderId && `order:${norm(f.orderId)}`,
    f.urls?.[0] && `url:${canonicalUrl(f.urls[0])}`,
    f.wifi && `wifi:${norm(f.wifi.ssid)}`,
    f.upi && `upi:${norm(f.upi.payee)}:${f.upi.amount ?? ''}`,
  ].filter((key): key is string => Boolean(key));
}

/**
 * Same kind of thing, same name, same amount, same day: almost certainly shared twice.
 * Undated items never match on name alone ("Swiggy" can be many different coupons).
 */
function looseKey(c: Candidate): string | null {
  if (c.dueAt === null) return null;
  return `${c.type}:${norm(c.title)}:${c.fields.amount ?? ''}:${new Date(c.dueAt).toDateString()}`;
}

export function isDuplicate(a: Candidate, b: Candidate): boolean {
  const aKeys = strongKeys(a);
  const bKeys = strongKeys(b);
  // When both carry identifiers, the identifiers decide: two codes are two coupons.
  if (aKeys.length && bKeys.length) return aKeys.some((key) => bKeys.includes(key));
  const loose = looseKey(a);
  return loose !== null && loose === looseKey(b);
}
