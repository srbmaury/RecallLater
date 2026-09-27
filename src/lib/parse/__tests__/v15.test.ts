import { toLocalDateTime } from '@/lib/dates';

import { analyze } from '..';

// Wednesday, 23 Sep 2026, 10:00 local.
const NOW = new Date(2026, 8, 23, 10, 0);

describe('jobs', () => {
  it('reads a job post', () => {
    const result = analyze({
      text: "We're hiring!\nSoftware Engineer II\nStripe · Bengaluru (Hybrid)\n3+ years of experience\nApply by Oct 10\nhttps://stripe.com/jobs/listing/software-engineer-ii/6012345",
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'job',
      title: 'Software Engineer II',
      fields: { company: 'Stripe', location: 'Bengaluru', dueDate: '2026-10-10', stage: 'saved' },
    });
    expect(toLocalDateTime(result.reminder!.fireAt)).toBe('2026-10-09T19:00');
  });

  it('reads a job shared as one message', () => {
    const result = analyze({
      text: 'We are hiring a Software Engineer II at Stripe in Bengaluru. 3+ years of experience. Apply by Oct 10',
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'job',
      title: 'Software Engineer II',
      fields: { company: 'Stripe', location: 'Bengaluru', dueDate: '2026-10-10' },
    });
  });

  it('reads a LinkedIn job link', () => {
    const result = analyze({ text: 'https://www.linkedin.com/jobs/view/software-engineer-ii-at-stripe-3801234567', now: NOW });
    expect(result).toMatchObject({ type: 'job', title: 'Software Engineer II', fields: { company: 'Stripe' } });
  });
});

describe('coupons', () => {
  it('reads a coupon and reminds the day before it expires', () => {
    const result = analyze({
      text: 'Swiggy\nGet ₹200 OFF on orders above ₹499\nUse code DINNER200\nValid till 30 Sep 2026',
      now: NOW,
    });
    expect(result).toMatchObject({
      type: 'coupon',
      title: 'Swiggy · ₹200 OFF',
      fields: { couponCode: 'DINNER200', merchant: 'Swiggy', discount: '₹200 OFF', expiresOn: '2026-09-30' },
    });
    expect(result.reminder).toMatchObject({ mode: 'once' });
    expect(toLocalDateTime(result.reminder!.fireAt)).toBe('2026-09-29T19:00');
  });

  it('reads a percentage discount', () => {
    expect(analyze({ text: 'Flat 20% off at Myntra with code STYLE20', now: NOW }).fields).toMatchObject({
      couponCode: 'STYLE20',
      discount: '20% off',
      merchant: 'Myntra',
    });
  });

  it('normalizes OCR-missed currency and recognizes common coupon offers', () => {
    expect(analyze({ text: 'FOODRUSH\nCode DINNER200\n200 OFF\nValid till 29 Sep 2026', now: NOW }).fields)
      .toMatchObject({ discount: '₹200 OFF', couponCode: 'DINNER200' });
    expect(analyze({ text: 'Use code STYLEB0GO\nBuy 1 Get 1 Offer', now: NOW }).fields.discount).toBe('Buy 1 Get 1');
  });
});

describe('places', () => {
  it('reads a restaurant', () => {
    const result = analyze({
      text: 'Burma Burma\nBurmese · Vegetarian restaurant\n12th Main Rd, Indiranagar, Bengaluru 560038\nMust try the khow suey',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'place', title: 'Burma Burma', fields: { placeKind: 'eat' } });
    expect(result.fields.address).toContain('Indiranagar');
    expect(result.reminder).toBeNull();
  });

  it('reads a travel destination', () => {
    const result = analyze({ text: 'Gokarna: hidden beaches of Karnataka. Om Beach and Paradise Beach trek', now: NOW });
    expect(result).toMatchObject({ type: 'place', title: 'Gokarna', fields: { placeKind: 'destination' } });
  });

  it('reads a Google Maps place link', () => {
    const result = analyze({ text: 'https://www.google.com/maps/place/Burma+Burma/@12.97,77.64,17z', now: NOW });
    expect(result).toMatchObject({ type: 'place', title: 'Burma Burma' });
  });
});

describe('books and shows', () => {
  it('reads a book', () => {
    const result = analyze({ text: 'Designing Data-Intensive Applications by Martin Kleppmann\nPaperback', now: NOW });
    expect(result).toMatchObject({
      type: 'book',
      title: 'Designing Data-Intensive Applications',
      fields: { author: 'Martin Kleppmann' },
    });
  });

  it('reads a show and its platform', () => {
    const result = analyze({ text: 'Panchayat Season 4 is now streaming on Prime Video', now: NOW });
    expect(result).toMatchObject({ type: 'watch', title: 'Panchayat Season 4', fields: { platform: 'Prime Video' } });
  });

  it('treats IMDb links as watchlist items', () => {
    expect(analyze({ text: 'https://www.imdb.com/title/tt12004706/', now: NOW }).type).toBe('watch');
  });
});

describe('recipes', () => {
  it('reads ingredients', () => {
    const result = analyze({
      text: [
        'Paneer Butter Masala',
        'Serves 4 · Prep time 15 min',
        'Ingredients',
        '- 200g paneer',
        '- 2 tomatoes',
        '• 1 onion',
        '2 tbsp butter',
        '1/4 cup cream',
        '1 tsp garam masala',
        'Method',
        '1. Heat butter in a pan',
      ].join('\n'),
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'recipe', title: 'Paneer Butter Masala' });
    expect(result.fields.ingredients?.map((i) => i.text)).toEqual([
      '200g paneer',
      '2 tomatoes',
      '1 onion',
      '2 tbsp butter',
      '1/4 cup cream',
      '1 tsp garam masala',
    ]);
    expect(result.fields.ingredients?.every((i) => !i.done)).toBe(true);
  });
});

describe('warranties', () => {
  it('computes when a warranty ends', () => {
    const result = analyze({
      text: 'Tax Invoice\nSony WH-1000XM6 Headphones\nOrder Date: 23/09/2026\nGrand Total ₹24,990\nWarranty: 1 year',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'receipt', fields: { warrantyUntil: '2027-09-23' } });
  });
});

describe('QR codes', () => {
  const qr = (rawValue: string) => [{ format: 'qr', rawValue }];

  it('reads Wi-Fi details', () => {
    const result = analyze({ text: '', barcodes: qr('WIFI:T:WPA;S:HomeWiFi;P:secret123;;'), now: NOW });
    expect(result).toMatchObject({
      type: 'generic',
      title: 'Wi-Fi: HomeWiFi',
      fields: { wifi: { ssid: 'HomeWiFi', password: 'secret123', security: 'WPA' } },
    });
  });

  it('reads a contact card', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:John Smith\nTEL:+919876543210\nEMAIL:john@example.com\nEND:VCARD';
    const result = analyze({ text: '', barcodes: qr(vcard), now: NOW });
    expect(result).toMatchObject({
      title: 'John Smith',
      fields: { contact: { name: 'John Smith', phone: '+919876543210', email: 'john@example.com' } },
    });
  });

  it('reads a UPI payment request without acting on it', () => {
    const result = analyze({ text: '', barcodes: qr('upi://pay?pa=chaipoint@okicici&pn=Chai%20Point&am=120'), now: NOW });
    expect(result).toMatchObject({
      title: 'UPI: Chai Point',
      fields: { upi: { payee: 'chaipoint@okicici', name: 'Chai Point', amount: 120 } },
    });
  });
});
