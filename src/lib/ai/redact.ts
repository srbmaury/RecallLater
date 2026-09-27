// Only relative imports: also run directly by Node in e2e/ai-eval.mjs.
import { normalizeOcr } from '../parse/normalize.ts';

/** Exactly what leaves the device for AI understanding: cleaned-up OCR text, redacted. */
export function textForAi(text: string): string {
  return redact(normalizeOcr(text));
}

/**
 * Masks personal identifiers before text leaves the device for AI understanding.
 * Keeps what the item needs (amounts, dates, codes, PNRs, order IDs) and removes
 * what it doesn't: phone numbers, emails, card / Aadhaar / PAN numbers and labelled
 * account, consumer and customer numbers. See __tests__/redact.test.ts.
 */
export function redact(text: string): string {
  return (
    text
      .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '[email]')
      // Card numbers: 13–19 digits (optionally in groups of four) that pass the Luhn check,
      // so order and ticket numbers of the same length survive.
      .replace(/\b(?:\d{4}[ -]){2,3}\d{4}(?:[ -]\d{1,3})?\b|\b\d{13,19}\b/g, (m) => (luhn(m.replace(/\D/g, '')) ? '[card]' : m))
      // Aadhaar: 4-4-4.
      .replace(/\b\d{4}[ -]\d{4}[ -]\d{4}\b/g, '[id]')
      // PAN: ABCDE1234F.
      .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[id]')
      // International numbers: +country code, then at least 7 more digits.
      .replace(/\+\d{1,3}(?:[\s-]?\(?\d{1,5}\)?){2,5}/g, (m) => (m.replace(/\D/g, '').length >= 8 ? '[phone]' : m))
      // Indian mobile numbers, with or without 0.
      .replace(/(?<![\d+])0?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, '[phone]')
      // Indian landlines: STD code with a leading 0, "080-2345 6789", "(022) 2345 6789".
      .replace(/(?<!\d)\(?0\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/g, '[phone]')
      // Account / consumer / customer numbers when labelled.
      .replace(
        /\b(a\/c|account|acct|consumer|customer|ca|k)\s*(?:no\.?|number|id|#)?\s*[:\-\t]?\s*[A-Z0-9-]{6,}/gi,
        (m, label: string) => `${label} [account]`,
      )
  );
}

function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
