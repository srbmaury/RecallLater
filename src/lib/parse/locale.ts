/**
 * Whether a page is from the US, where "5/11/18" is 11 May and bare amounts are dollars.
 * RecallLater reads Indian formats by default; this only switches on strong evidence, so an
 * Indian bill never flips: a dollar amount, a US state with a ZIP code, a phone number written
 * "(562) 699-7484", or "562-699-7484" together with a tip or sales-tax line.
 */
const STATE_ZIP =
  /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)[,.]?\s+\d{5}(?:-\d{4})?\b/;
// "(562) 699-7484" is American on its own; "562-699-7484" needs a second sign.
const US_PHONE_BRACKETED = /\(\d{3}\)\s?\d{3}-\d{4}\b/;
const US_PHONE = /\b\d{3}[-.]\d{3}[-.]\d{4}\b/;
const US_RECEIPT_WORDS = /\btip\b|\bgratuity\b|\bsales tax\b/i;

export function looksAmerican(text: string): boolean {
  if (/₹|\brs\.?\s?\d|\binr\b/i.test(text)) return false;
  return (
    /\$\s?\d/.test(text) ||
    STATE_ZIP.test(text) ||
    US_PHONE_BRACKETED.test(text) ||
    (US_PHONE.test(text) && US_RECEIPT_WORDS.test(text))
  );
}
