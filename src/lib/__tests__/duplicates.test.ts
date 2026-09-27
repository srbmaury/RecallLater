import type { Candidate } from '../duplicates';
import { canonicalUrl, isDuplicate } from '../duplicates';

const due = new Date(2026, 8, 28).getTime();
const bill = (over: Partial<Candidate> = {}): Candidate => ({
  type: 'bill',
  title: 'Electricity Bill',
  fields: { amount: 2840 },
  dueAt: due,
  ...over,
});

describe('duplicate detection', () => {
  it('matches the same bill shared twice', () => {
    expect(isDuplicate(bill(), bill())).toBe(true);
    expect(isDuplicate(bill(), bill({ title: 'ELECTRICITY BILL' }))).toBe(true);
  });

  it('keeps different months or amounts apart', () => {
    expect(isDuplicate(bill(), bill({ dueAt: new Date(2026, 9, 28).getTime() }))).toBe(false);
    expect(isDuplicate(bill(), bill({ fields: { amount: 3100 } }))).toBe(false);
  });

  it('matches on identifiers even when titles differ', () => {
    const ticket = (title: string): Candidate => ({ type: 'travel', title, fields: { pnr: 'X7K2QP' }, dueAt: null });
    expect(isDuplicate(ticket('DEL → BLR'), ticket('Flight 6E 6132'))).toBe(true);
    const coupon = (code: string): Candidate => ({ type: 'coupon', title: 'Swiggy', fields: { couponCode: code }, dueAt: null });
    expect(isDuplicate(coupon('DINNER200'), coupon('dinner200'))).toBe(true);
    expect(isDuplicate(coupon('DINNER200'), coupon('LUNCH100'))).toBe(false);
  });

  it('treats a re-shared link with tracking parameters as the same product', () => {
    const product = (url: string): Candidate => ({ type: 'purchase', title: 'Headphones', fields: { urls: [url] }, dueAt: null });
    expect(
      isDuplicate(
        product('https://www.amazon.in/dp/B0CXYZ1234?ref=share&tag=abc'),
        product('https://amazon.in/dp/B0CXYZ1234/'),
      ),
    ).toBe(true);
    expect(canonicalUrl('https://www.amazon.in/dp/B0CXYZ1234?ref=x#top')).toBe('amazon.in/dp/b0cxyz1234');
  });

  it('never matches undated generic notes on title alone', () => {
    const note: Candidate = { type: 'generic', title: 'Ideas', fields: {}, dueAt: null };
    expect(isDuplicate(note, { ...note })).toBe(false);
  });
});
