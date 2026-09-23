import { toLocalDateTime } from '@/lib/dates';

import { analyze } from '..';
import { findDates } from '../dates';
import { findAmounts, primaryAmount } from '../money';
import { taskTitle, titleFromUrl } from '../title';

// Wednesday, 23 Sep 2026, 10:00 local.
const NOW = new Date(2026, 8, 23, 10, 0);

describe('findDates', () => {
  it.each([
    ['Due Date: 28/09/2026', '2026-09-28'],
    ['due 28-09-26', '2026-09-28'],
    ['Pay by 28 Sep 2026', '2026-09-28'],
    ['Pay by 28th September', '2026-09-28'],
    ['Pay by Sep 28, 2026', '2026-09-28'],
    ['on 2026-09-28', '2026-09-28'],
    ['12/31/2026', '2026-12-31'],
  ])('reads %s', (text, expected) => {
    expect(findDates(text, NOW)[0].date).toBe(expected);
  });

  it('resolves weekdays and relative days against now', () => {
    expect(findDates('before we speak on Friday', NOW)[0].date).toBe('2026-09-25');
    expect(findDates('call me tomorrow', NOW)[0].date).toBe('2026-09-24');
    // Said on a Wednesday, "Wednesday" means next week.
    expect(findDates('see you Wednesday', NOW)[0].date).toBe('2026-09-30');
  });

  it('rolls year-less dates long past into next year', () => {
    expect(findDates('Jan 5', NOW)[0].date).toBe('2027-01-05');
    expect(findDates('Sep 1', NOW)[0].date).toBe('2026-09-01');
  });

  it('attaches times on the same line', () => {
    const [match] = findDates('Sep 29 · 06:20', NOW);
    expect(match).toMatchObject({ date: '2026-09-29', time: '06:20' });
    expect(findDates('Sat, 5 Oct 6:30 PM', NOW)[0]).toMatchObject({ date: '2026-10-05', time: '18:30' });
  });

  it('does not read an hour as a two-digit year', () => {
    expect(findDates('5 Mar 10:30', NOW)[0]).toMatchObject({ date: '2027-03-05', time: '10:30' });
  });

  it('labels dates from nearby words', () => {
    const [billDate, dueDate] = findDates('Bill Date: 01/09/2026  Due Date: 28/09/2026', NOW);
    expect(billDate.label).toBe('purchase');
    expect(dueDate.label).toBe('due');
    expect(findDates('Due Date\n28/09/2026', NOW)[0].label).toBe('due');
  });

  it('drops a weekday that restates an adjacent date', () => {
    expect(findDates('Friday, 25 Sep', NOW)).toHaveLength(1);
  });
});

describe('findAmounts', () => {
  it('reads Indian formats', () => {
    expect(findAmounts('₹2,840')[0]).toMatchObject({ amount: 2840, currency: 'INR' });
    expect(findAmounts('Rs. 1,23,456.50')[0].amount).toBe(123456.5);
    expect(findAmounts('Total 2,840/-')[0]).toMatchObject({ amount: 2840, currency: 'INR' });
    expect(findAmounts('Amount Payable: 2840.00')[0].amount).toBe(2840);
  });

  it('prefers the labelled amount over larger ones', () => {
    const amounts = findAmounts('Previous balance ₹9,000\nTotal amount due ₹2,840');
    expect(primaryAmount(amounts)?.amount).toBe(2840);
  });

  it('ignores percentages', () => {
    expect(findAmounts('₹200 OFF, save 20%').map((a) => a.amount)).toEqual([200]);
  });
});

describe('titles', () => {
  it('turns an ask into a task', () => {
    expect(taskTitle('Can you send me the updated deck before we speak on Friday?')).toBe('Send updated deck');
    expect(taskTitle('Hey Rahul, please pick up the cake tomorrow')).toBe('Pick up cake');
    expect(taskTitle("Don't forget to renew the car insurance by Oct 3")).toBe('Renew car insurance');
  });

  it('builds product names from shop URLs', () => {
    expect(titleFromUrl('https://www.amazon.in/Sony-WH-1000XM6-Wireless-Cancelling-Headphones/dp/B0CXYZ1234?ref=x')).toBe(
      'Sony WH 1000XM6 Wireless Cancelling Headphones',
    );
  });
});

describe('analyze', () => {
  it('understands an electricity bill', () => {
    const result = analyze({
      text: 'BESCOM\nElectricity Bill\nBill Date: 01/09/2026\nDue Date: 28/09/2026\nTotal Amount Due ₹2,840.00',
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'bill',
      title: 'Electricity Bill',
      fields: { amount: 2840, currency: 'INR', dueDate: '2026-09-28', purchasedOn: '2026-09-01' },
      keyDate: '2026-09-28',
    });
    expect(result.reminder?.mode).toBe('until_done');
    expect(toLocalDateTime(result.reminder!.fireAt)).toBe('2026-09-27T19:00');
  });

  it('understands a WhatsApp ask', () => {
    const result = analyze({ text: 'Can you send me the updated deck before we speak on Friday?', now: NOW });
    expect(result).toMatchObject({ type: 'task', title: 'Send updated deck', fields: { dueDate: '2026-09-25' } });
    // Thursday evening.
    expect(toLocalDateTime(result.reminder!.fireAt)).toBe('2026-09-24T19:00');
  });

  it('understands a flight ticket', () => {
    const result = analyze({
      text: 'IndiGo\nBoarding Pass\nDEL → BLR\nFlight 6E 6132\nDeparture Sep 29 · 06:20\nPNR: X7K2QP',
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'travel',
      title: 'DEL → BLR',
      fields: { flightNumber: '6E 6132', pnr: 'X7K2QP', startsAt: '2026-09-29T06:20', from: 'DEL', to: 'BLR' },
    });
    expect(toLocalDateTime(result.reminder!.fireAt)).toBe('2026-09-29T03:20');
    expect(result.calendar).toMatchObject({ title: 'DEL → BLR', allDay: false });
  });

  it('understands an event poster', () => {
    const result = analyze({
      text: 'DevFest Bengaluru 2026\nSat, 5 Oct · 9:30 AM\nVenue: NIMHANS Convention Centre\nRegister now',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'event', title: 'DevFest Bengaluru 2026', fields: { startsAt: '2026-10-05T09:30' } });
    expect(result.calendar).not.toBeNull();
  });

  it('understands a receipt with a return window', () => {
    const result = analyze({
      text: 'Tax Invoice\nSony WH-1000XM6 Headphones\nOrder Date: 23/09/2026\nOrder ID: 402-1234567-7654321\nGrand Total ₹24,990\nReturn within 7 days',
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'receipt',
      fields: { amount: 24990, purchasedOn: '2026-09-23', returnBy: '2026-09-30', orderId: '402-1234567-7654321' },
    });
  });

  it('treats shop links as purchases', () => {
    const result = analyze({ text: 'https://www.amazon.in/Sony-WH-1000XM6-Wireless-Headphones/dp/B0CXYZ1234', now: NOW });
    expect(result).toMatchObject({ type: 'purchase', title: 'Sony WH 1000XM6 Wireless Headphones', reminder: null });
  });

  it('falls back to a generic item', () => {
    const result = analyze({ text: 'Interesting thought about gardens and light.', now: NOW });
    expect(result.type).toBe('generic');
    expect(result.reminder).toBeNull();
  });

  it('respects a type chosen by the user', () => {
    const result = analyze({ text: 'Burma Burma, Indiranagar', now: NOW, type: 'task' });
    expect(result.type).toBe('task');
    expect(result.reminder?.mode).toBe('until_done');
  });

  it('uses URLs from QR codes', () => {
    const result = analyze({ text: '', now: NOW, barcodes: [{ format: 'qr', rawValue: 'https://example.com/event' }] });
    expect(result.fields.urls).toEqual(['https://example.com/event']);
  });
});
