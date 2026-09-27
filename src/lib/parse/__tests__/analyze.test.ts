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

  it('keeps adjacent table date labels attached to their own column', () => {
    expect(findDates('PURCHASE DATE: 22 Sep 2026\nWARRANTY UNTIL: 21 Sep 2027', NOW)).toMatchObject([
      { date: '2026-09-22', label: 'purchase' },
      { date: '2027-09-21', label: 'warranty' },
    ]);
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

  it('reads a product screenshot price instead of the crossed-out MRP', () => {
    const result = analyze({
      text: 'Amazon\nPremium Cat Portrait Print 12x18\n4.3 | 1,200 ratings\n73,999\nMRP F4,998 20% off\nBUY NOW',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'purchase', title: 'Premium Cat Portrait Print 12x18', fields: { amount: 3999 } });
  });

  it('reads a shared map location title and address', () => {
    const result = analyze({ text: 'Shared location\nOrchid Studio\n21 Linden Road, Sector 2, Bengaluru, Karnataka 560001', now: NOW });
    expect(result).toMatchObject({ type: 'place', title: 'Orchid Studio', fields: { address: expect.stringContaining('Linden Road') } });
  });

  it('reads a recipe title below its publication header', () => {
    const result = analyze({
      text: 'Everyday Bowls\nCreamy Mocha Overnight Oats\n15 min Easy · Serves 2\nIngredients\n• rolled oats\n• milk',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'recipe', title: 'Creamy Mocha Overnight Oats' });
  });

  it('reads the company directly below a job role', () => {
    const result = analyze({ text: 'LinkedIn\nSoftware Engineer II\nNimbus Labs\nMumbai Hybrid · Full-time\nApplication deadline: 05 Oct 2026', now: NOW });
    expect(result).toMatchObject({ type: 'job', title: 'Software Engineer II', fields: { company: 'Nimbus Labs' } });
  });

  it('reads labelled event fields from a PDF', () => {
    const result = analyze({
      text: 'EVENT DOCUMENT\nSynthetic RecallLater test document\nCosmic Night\nEVENT NAME\tCosmic Night\nDATE\tSATURDAY · 03 OCTOBER\nTIME\t5:30 PM\nVENUE\tNehru Planetarium, Bengaluru',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'event', title: 'Cosmic Night', fields: { startsAt: '2026-10-03T17:30' } });
  });

  it('uses explicit task and deadline labels in a PDF', () => {
    const result = analyze({
      text: 'MESSAGE DOCUMENT\nTASK\tCan you send the updated version before our call\nDEADLINE TEXT\tFriday',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'task', title: 'Send updated version', fields: { dueDate: '2026-09-25' } });
  });

  it('extracts product, price, and company labels from an order or job PDF', () => {
    const order = analyze({
      text: 'ORDER DOCUMENT\nPremium Cat Portrait Print 12x18\nPRODUCT\tPremium Cat Portrait Print 12x18\nPRICE\t4999\nORDER ID\tRL-2610-8840',
      now: NOW,
    });
    expect(order).toMatchObject({
      type: 'receipt',
      title: 'Premium Cat Portrait Print 12x18',
      fields: { amount: 4999, orderId: 'RL-2610-8840' },
    });

    const job = analyze({
      text: 'JOB DOCUMENT\nSoftware Engineer II\nCOMPANY\tNimbus Labs\nROLE\tSoftware Engineer II\nLOCATION\tMumbai\nDEADLINE\t05 Oct 2026',
      now: NOW,
    });
    expect(job).toMatchObject({
      type: 'job',
      title: 'Software Engineer II',
      fields: { company: 'Nimbus Labs', location: 'Mumbai', dueDate: '2026-10-05' },
    });
  });

  it('prefers the labelled coupon offer over unrelated document years', () => {
    const result = analyze({
      text: 'COUPON DOCUMENT\nSynthetic RecallLater test document\nFOODRUSH\nMERCHANT\tFOODRUSH\nCODE\tDINNER200\nEXPIRY\t29 Sep 2026\nOFFER\t₹200 OFF',
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'coupon',
      title: 'FOODRUSH · ₹200 OFF',
      fields: { merchant: 'FOODRUSH', couponCode: 'DINNER200', expiresOn: '2026-09-29', discount: '₹200 OFF' },
    });
  });

  it('reads dish and comma-separated ingredients from a recipe PDF', () => {
    const result = analyze({
      text: 'RECIPE DOCUMENT\nCreamy Mocha Overnight Oats\nDISH\tCreamy Mocha Overnight Oats\nINGREDIENTS\trolled oats, milk, espresso, chia seeds, maple syrup',
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'recipe',
      title: 'Creamy Mocha Overnight Oats',
      fields: { ingredients: [{ text: 'rolled oats' }, { text: 'milk' }, { text: 'espresso' }, { text: 'chia seeds' }, { text: 'maple syrup' }] },
    });
  });

  it('preserves a printed warranty end date over an estimated term', () => {
    const text = 'WARRANTY CERTIFICATE\nNoise-cancelling Headphones X2\nPURCHASE DATE\tWARRANTY UNTIL\n22 Sep 2026\t21 Sep 2027\nWARRANTY MONTHS\t12';
    const result = analyze({
      text,
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'receipt',
      title: 'Noise-cancelling Headphones X2',
      fields: { purchasedOn: '2026-09-22', warrantyUntil: '2027-09-21' },
    });
  });

  it('reads hyphenated warranty terms on receipts', () => {
    const result = analyze({ text: 'Tax invoice\nUSB-C Hub\n23 Sep 2026\nUSB-C Hub: 12-month warranty', now: NOW });
    expect(result.fields.warrantyUntil).toBe('2027-09-23');
  });

  it('falls back to a generic item', () => {
    const result = analyze({ text: 'Interesting thought about gardens and light.', now: NOW });
    expect(result.type).toBe('generic');
    expect(result.reminder).toBeNull();
  });

  it('recognizes book covers with stacked title lines and an author', () => {
    for (const [text, title, author] of [
      ['SYSTEMS THAT\nREMEMBER\nMira Sen', 'Systems That Remember', 'Mira Sen'],
      ['DESIGNING\nRELIABLE THINGS\nArun Vale', 'Designing Reliable Things', 'Arun Vale'],
      ['SMALL TOOLS, BIG\nLEVERAGE\nNina Roy', 'Small Tools, Big Leverage', 'Nina Roy'],
    ]) {
      expect(analyze({ text, now: NOW })).toMatchObject({ type: 'book', title, fields: { author } });
    }
  });

  it('chooses show names over genre tags and studio wordmarks', () => {
    expect(analyze({ text: 'ORBITAL\nA NEW SC-FI SERIES\nStreaming October 2\nADD TO WATCHLIST', now: NOW }))
      .toMatchObject({ type: 'watch', title: 'ORBITAL' });
    expect(analyze({ text: 'AFTER MIDNIGHT\nDRAMA 8 EPISODES\nA city goes quiet after midnight.\nADD TO WATCHLIST', now: NOW }))
      .toMatchObject({ type: 'watch', title: 'AFTER MIDNIGHT' });
  });

  it('repairs OCR month and currency glyphs in posters and amounts', () => {
    expect(analyze({ text: 'COSMIC NIGHT\nSATURDAY 03 0CTOBER\n5:30 PM\nTickets from 499', now: NOW }))
      .toMatchObject({ type: 'event', fields: { startsAt: '2026-10-03T17:30' } });
    expect(analyze({ text: 'Mobile Dev Day\nSUNDAY11 0CTOBER\n5:30 PM\nTickets from 499', now: NOW }))
      .toMatchObject({ type: 'event', fields: { startsAt: '2026-10-11T17:30' } });
    expect(analyze({ text: 'METRO GAS - BILL\nAMOUNT DUE\nI2,157.00\nDue date\n29 Sep 2026', now: NOW }).fields.amount)
      .toBe(2157);
  });

  it('recognizes a restaurant from its social post and food description', () => {
    expect(analyze({ text: 'Instagram\nOlive Courtyard\nPune\nA tiny neighbourhood kitchen worth crossing town for.', now: NOW }))
      .toMatchObject({ type: 'place', title: 'Olive Courtyard' });
  });

  it('uses the product line below an order number as the saved title', () => {
    expect(analyze({ text: 'Amazon\nOrder confirmed\nOrder #RL-2610-8840\nPremium Cat Portrait Print\n12x18\n4,999', now: NOW }))
      .toMatchObject({ type: 'receipt', title: 'Premium Cat Portrait Print 12x18' });
  });

  it('repairs rupee and OFF OCR on discount cards', () => {
    expect(analyze({ text: 'QUICKGROCERY\n7150 0FF\nCOUPON CODE\nSAVE150\nValid until 08 Oct 2026', now: NOW }))
      .toMatchObject({ type: 'coupon', fields: { discount: '₹150 OFF', couponCode: 'SAVE150' } });
    expect(analyze({ text: 'TRAVELGO\n7500 OFF\nCOUPON CODE\nFLY500\nValid until 11 Oct 2026', now: NOW }).fields.discount)
      .toBe('₹500 OFF');
    expect(analyze({ text: 'TRAVELGO\n7500 OFF\nCOUPON CODE\nSAVE7500\nValid until 11 Oct 2026', now: NOW }).fields.discount)
      .toBe('₹7500 OFF');
  });

  it('extracts every ingredient from the mixed-column recipe PDF', () => {
    const sample = (require('./fixtures/dataset.json') as { id: string; text: string }[]).find((item) => item.id === 'pdf_007')!;
    const result = analyze({ text: sample.text, now: NOW, type: 'recipe' });
    expect(result.fields.ingredients?.map((item) => item.text)).toEqual([
      '1 cup rolled oats', '1 cup milk', '1 tbsp cocoa powder', '1 tsp instant coffee',
      '2 tbsp yogurt', '1 tbsp honey', 'banana slices',
    ]);
  });

  it('keeps a final quantity-free ingredient from a recipe screenshot', () => {
    const sample = (require('./fixtures/dataset.json') as { id: string; text: string }[]).find((item) => item.id === 'img_010')!;
    const result = analyze({ text: sample.text, now: NOW, type: 'recipe' });
    expect(result.fields.ingredients?.map((item) => item.text)).toContain('banana slices');
  });

  it('uses a structured Wi-Fi QR payload instead of nearby café OCR', () => {
    const result = analyze({
      text: 'CAFE WI-FI\nScan with camera', now: NOW,
      barcodes: [{ format: 'qr', rawValue: 'WIFI:T:WPA;S:RecallCafe1;P:demo-pass-1;;' }],
    });
    expect(result).toMatchObject({ type: 'generic', title: 'Wi-Fi: RecallCafe1', fields: { wifi: { ssid: 'RecallCafe1' } } });
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

// What on-device OCR returns for real layouts: one line per visual row, cells separated
// by tabs, labels printed above their values.
describe('grid layouts from OCR', () => {
  it('reads a boarding pass with labels above values', () => {
    const text = [
      'IndiGo\tBOARDING PASS',
      'FROM\tTO',
      'DEL\tBLR',
      'New Delhi\tBengaluru',
      'FLIGHT\tDATE\tDEPARTURE\tGATE',
      '6E 6132\t29SEP\t06:20\t14',
      'PASSENGER\tPNR\tSEAT\tBOARDING',
      'TEST/USER\tX7K2QP\t12A\t05:35',
      'MR',
      'Gate closes 25 minutes before departure',
    ].join('\n');
    expect(analyze({ text, now: NOW })).toMatchObject({
      type: 'travel',
      title: 'DEL → BLR',
      fields: { flightNumber: '6E 6132', pnr: 'X7K2QP', startsAt: '2026-09-29T06:20', from: 'DEL', to: 'BLR' },
    });
  });

  it('finds the route even when the plane glyph is read as text', () => {
    const text = 'FROM\t\tTO\nDEL\t✈\tBLR\nFLIGHT\tDATE\n6E 6132\t29 SEP 2026';
    expect(analyze({ text, now: NOW }).fields).toMatchObject({ from: 'DEL', to: 'BLR' });
  });

  it('reads a coloured bill with a header row and a charges table', () => {
    const text = [
      'BESCOM',
      'Bangalore Electricity Supply Company Ltd.',
      'Account ID\tBill Date\tDue Date',
      '1234567890\t01-Sep-2026\t28-Sep-2026',
      'Energy Charges\t₹ 2,410.00',
      'Fixed Charges\t₹ 280.00',
      'Tax\t₹ 150.00',
      'Amount Payable\t₹ 2,840.00',
      'Pay before the due date to avoid a late payment surcharge.',
    ].join('\n');
    expect(analyze({ text, now: NOW })).toMatchObject({
      type: 'bill',
      title: 'Electricity Bill',
      fields: { amount: 2840, dueDate: '2026-09-28', purchasedOn: '2026-09-01' },
    });
  });

  it('attaches a separately labelled time to an event date', () => {
    const text = 'DevFest Bengaluru\nDate\tTime\tVenue\n5 Oct 2026\t9:30 AM\tNIMHANS Convention Centre\nRegister now';
    expect(analyze({ text, now: NOW }).fields.startsAt).toBe('2026-10-05T09:30');
  });
});
