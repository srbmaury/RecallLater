import { redact } from '../redact';
import { fieldsFromAi, mergeWithAi } from '../merge';

// The app tells users these are removed before any text goes to AI; hold it to that.
describe('redact', () => {
  it.each([
    ['Call me on 98765 43210', '98765 43210'],
    ['Mobile: +91 98765-43210', '98765-43210'],
    ['WhatsApp 9876543210', '9876543210'],
    ['Office 080-2345 6789', '2345 6789'],
    ['Landline (022) 2345 6789', '2345 6789'],
    ['US desk +1 415 555 0100', '555 0100'],
    ['Mail priya.s@example.com', 'priya.s@example.com'],
    ['Card 4111 1111 1111 1111', '4111'],
    ['Card no 4111111111111111', '4111111111111111'],
    ['Aadhaar 1234 5678 9012', '5678 9012'],
    ['PAN ABCDE1234F', 'ABCDE1234F'],
    ['Account No: 00112233445566', '00112233445566'],
    ['A/c 12345678901', '12345678901'],
    ['Consumer No: 1234567890', '1234567890'],
    ['Customer ID CUST-88213-77', 'CUST-88213-77'],
  ])('masks %s', (input, secret) => {
    expect(redact(input)).not.toContain(secret);
  });

  it.each([
    ['Total Amount Due ₹2,840.00'],
    ['Due Date: 28/09/2026'],
    ['PNR: X7K2QP'],
    ['Train 12560 departs 20:10'],
    ['Order # 407-0000123-0000456'],
    ['Order ID: RL-2610-8840'],
    ['Use code DINNER200'],
    ['Flight 6E 6132'],
    ['Invoice TM-0923-7741'],
    ['Booking ID RLX31K9'],
    ['PNR 2456789012'],
  ])('keeps what the item needs: %s', (input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('AI extraction validation', () => {
  it('does not let unsupported amounts or dates replace deterministic facts', () => {
    const text = 'Electricity bill amount due ₹2,840 due 28 Sep 2026';
    const fields = fieldsFromAi({ type: 'bill', title: 'Electricity bill', confidence: 0.9, amount: 9999, dueDate: '2026-10-01' }, text);
    expect(fields.amount).toBeUndefined();
    expect(fields.dueDate).toBeUndefined();
    const merged = mergeWithAi({ text, now: new Date(2026, 8, 23) }, {
      type: 'bill', title: 'Something else', confidence: 0.9, amount: 9999, dueDate: '2026-10-01',
    });
    expect(merged.fields).toMatchObject({ amount: 2840, dueDate: '2026-09-28' });
    expect(merged.title).toBe('Electricity Bill');
  });

  it('keeps AI corrections when the source explicitly contains the normalized value', () => {
    const fields = fieldsFromAi({ type: 'bill', title: 'Electricity Bill', confidence: 0.9, amount: 2840 }, 'Amount due ₹2,840');
    expect(fields.amount).toBe(2840);
  });

  it('accepts locale-normalized amounts and dates resolved from relative text', () => {
    const fields = fieldsFromAi(
      { type: 'bill', title: 'Power bill', confidence: 0.9, amount: 2840, dueDate: '2026-09-25' },
      'Amount due: 2,840.00. Please pay by Friday.',
      new Date(2026, 8, 23, 10),
    );
    expect(fields).toMatchObject({ amount: 2840, dueDate: '2026-09-25' });
  });

  it('accepts a title when OCR joined words that the model separated', () => {
    const merged = mergeWithAi(
      { text: 'EVENT DOCUMENT\nNIGHTOF IDEAS\nEVENT NAME\tNIGHTOF IDEAS', now: new Date(2026, 8, 23, 10) },
      { type: 'event', title: 'Night of Ideas', confidence: 0.9 },
    );
    expect(merged.title).toBe('Night of Ideas');
  });

  it('keeps a specific deterministic type when AI returns generic', () => {
    const merged = mergeWithAi(
      { text: 'SYSTEMS THAT\nREMEMBER\nMira Sen', now: new Date(2026, 8, 23, 10) },
      { type: 'generic', title: 'Remember', confidence: 0.4 },
    );
    expect(merged).toMatchObject({ type: 'book', title: 'Systems That Remember', fields: { author: 'Mira Sen' } });
  });

  it('keeps structured QR data generic even when nearby text looks like an event', () => {
    const merged = mergeWithAi(
      { text: 'EVENT CHECK-IN\nScan with camera', barcodes: [{ format: 'qr', rawValue: 'https://events.example.test/checkin/100' }] },
      { type: 'event', title: 'Event Check-in', confidence: 0.9 },
    );
    expect(merged).toMatchObject({ type: 'generic', fields: { urls: ['https://events.example.test/checkin/100'] } });
  });

  it('prefers parsed coupon wording over promotional boilerplate from AI', () => {
    const text = 'CAFECLUB\nFREE DESSERT\nLimited-time offer\nCOUPON CODE\nSWEETFREE\nValid until 14 Oct 2026';
    const merged = mergeWithAi(
      { text, now: new Date(2026, 8, 23, 10) },
      { type: 'coupon', title: 'Free Dessert', confidence: 0.9, discount: 'Limited-time offer' },
    );
    expect(merged.fields.discount).toBe('FREE DESSERT');
  });
});
