import { analyze } from '..';
import { findDates } from '../dates';
import { findAmounts } from '../money';
import { normalizeOcr } from '../normalize';

// Wednesday, 23 Sep 2026, 10:00 local.
const NOW = new Date(2026, 8, 23, 10, 0);

describe('₹ read as 7', () => {
  it('repairs it when the page confirms the amount', () => {
    // The UPI line repeats the total; the fee and ticket add up to it.
    expect(normalizeOcr('Subtotal\t450\nTotal\t7486\nPaid via UPI\t486')).toContain('Total\t₹486');
    expect(normalizeOcr('Ticket Price\t598\nConvenience Fee\t78\nTotal Amount\t7676')).toContain('Total Amount\t₹676');
  });

  it('repairs a price-shaped amount when no currency sign survived', () => {
    expect(normalizeOcr('Ticket Price\n7333\n(Materials Included)')).toContain('₹333');
    expect(normalizeOcr('FARE\nPASSENGER NAME\nRohan Mehta\t7821')).toContain('₹821');
  });

  it('leaves real numbers alone', () => {
    // Grouped amounts, item rows without a money label, and phone numbers.
    expect(normalizeOcr('Total\t12,999')).toContain('Total\t12,999');
    expect(normalizeOcr('Cappuccino\t1\t750\t750')).toContain('750\t750');
    expect(normalizeOcr('Ph: 080 4123 7789')).toContain('7789');
    // A ₹ that OCR kept means a 7 is a 7.
    expect(normalizeOcr('Price ₹120\nTotal 7300')).toContain('Total 7300');
  });
});

describe('amounts', () => {
  it('does not credit a year with the next number’s ₹', () => {
    expect(findAmounts('22 Oct 2026\t₹850').map((a) => a.amount)).toEqual([850]);
  });

  it('reads a value two lines under its label', () => {
    expect(analyze({ text: 'Water Bill\nAmount Due\tPay by 12 Oct 2026\nto avoid late payment charges.\n₹1,467\nMeter 220', now: NOW }).fields.amount).toBe(1467);
  });
});

describe('dates', () => {
  it('reads "tomorrow" in a slogan as a noun', () => {
    expect(findDates('A Greener, Kinder Tomorrow\nBright Students. Brighter Tomorrows.', NOW)).toEqual([]);
    expect(findDates('Invest in tomorrow’s leaders', NOW)).toEqual([]);
    expect(findDates('Pay the rent tomorrow', NOW)).toHaveLength(1);
  });

  it('lets a nearby weekday restate an explicit date and lend it its time', () => {
    const dates = findDates('Community Concert\n13 Oct 2026\tRivermist Grounds\nTuesday | 6:30 PM onwards', NOW);
    expect(dates.map((d) => [d.date, d.time])).toEqual([['2026-10-13', '18:30']]);
  });
});

describe('types from the new images', () => {
  const typeOf = (text: string) => analyze({ text, now: NOW }).type;

  it('tells bookings apart from trips', () => {
    expect(typeOf('Saffron Table\nReservation Confirmed\nDate\t9 Oct 2026\nTime\t7:30 PM\nParty Size\t3 Guests')).toBe('place');
    expect(typeOf('CineVerse\nBooking Confirmed!\nYour movie tickets are ready.\nScreen 2\tSeats A12, A13')).toBe('event');
    expect(typeOf('Event Confirmation\nEvent: Autumn Fellowship 2026\nDate: 5 Oct 2026\nBooking Reference: RL127\nNo. of Guests: 2')).toBe('event');
  });

  it('reads counter receipts and order updates as receipts', () => {
    expect(typeOf('Cedar Café\nBill No: 10437\nCashier: Asha\nSubtotal\t450\nTotal\t₹486\nPaid via UPI\t486')).toBe('receipt');
    expect(typeOf('Track Order\nOrder ID: RL140\nOut for Delivery\nEstimated Delivery\n18 Oct 2026')).toBe('receipt');
  });

  it('reads a shop page as something to buy', () => {
    expect(typeOf('Compact Travel Umbrella\n4.5 (320 reviews)\n₹1,249\nReturn by: 16 Oct 2026\nAdd to Wishlist\tAdd to Cart')).toBe('purchase');
  });
});

describe('titles', () => {
  const titleOf = (text: string) => analyze({ text, now: NOW }).title;

  it('skips table headings, codes and dates for the name', () => {
    expect(titleOf('Item\tRate\tAmount\nCedar Café\nCashier: Asha\nTotal\t₹486\nPaid via UPI\t486')).toBe('Cedar Café');
    expect(titleOf('Qty\tRate () Amount ()\nFreshkart\nCashier: Kavya\nTotal ₹734')).toBe('Freshkart');
  });

  it('drops labels, dates and taglines glued to the name', () => {
    expect(titleOf('Lemon Herb Pasta\tCook Time: 25 min\nIngredients\n• pasta\n• lemon\n• garlic\nMethod\n1. Boil the pasta.')).toBe('Lemon Herb Pasta');
    expect(titleOf('Riverside Home Decor\tDecor for a Brighter Home\nINVOICE\nTotal ₹1,256')).toBe('Riverside Home Decor');
    expect(titleOf('RUN FOR A BRIGHTER YOU\tStrideHub\nSales Receipt\nCashier: Ravi\nTotal ₹1720')).toBe('StrideHub');
    expect(titleOf('Sunrise Home Needs 21 Oct 2026\nNote to self')).not.toMatch(/2026/);
  });
});

describe('till receipts', () => {
  it('reads a restaurant receipt as a receipt from its parts', () => {
    const text = 'VILLA DESTE RESTAURANT\nServer: Jerry\nTable: 3\n1 Coffee\t3.50\n1 Wine\t9.95\n1 Shrimp\t12.95\n1 Veal\t25.95\nSUB TOTAL:\t52.35\nTax\t4.65\nTOTAL:\t57.00\nThank you for dining';
    expect(analyze({ text, now: NOW }).type).toBe('receipt');
  });

  it('finds the total from subtotal + tax when OCR puts values before their labels', () => {
    const text = 'VILLA DESTE\nServer: Jerry\n87.25\nSUB TOTAL:\n7.53\nTax 1:\n$94.78\nTOTAL:\nCash\t100.00\nChange\t5.22';
    expect(analyze({ text, now: NOW }).fields.amount).toBe(94.78);
  });

  it('does not take cash tendered or a tip suggestion for the total', () => {
    const text = 'Cafe\nSubtotal\t20.00\nTax\t1.60\nTotal\t21.60\nCash\t40.00\nChange\t18.40\nSuggested tip 20%\t4.32';
    expect(analyze({ text, now: NOW }).fields.amount).toBe(21.6);
  });
});

describe('American pages', () => {
  it('reads dates month first and amounts as dollars', () => {
    const r = analyze({ text: 'GREEN FIELD\nLong Beach, CA 90804\nServer: Frac\n1 Coffee\t3.00\nSUB TOTAL:\t48.90\nTax\t3.67\nTOTAL:\t52.57\n9/1/2016 11:24 AM', now: NOW });
    expect(r.fields).toMatchObject({ purchasedOn: expect.stringMatching(/^2016-09-01/), amount: 52.57, currency: 'USD' });
  });

  it('leaves Indian pages day first', () => {
    // Indian numbers group differently and PIN codes have six digits.
    const r = analyze({ text: 'Freshkart\nChennai 600026\nPh: 044-2789 4455\nCashier: Kavya\nDate: 9/1/2026\nSubtotal 700\nGST 34\nTotal ₹734', now: NOW });
    expect(r.fields.purchasedOn).toMatch(/^2026-01-09/);
    expect(r.fields.currency).toBe('INR');
  });
});
