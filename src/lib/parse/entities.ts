export type Entities = {
  urls: string[];
  emails: string[];
  phones: string[];
  pnr?: string;
  flightNumber?: string;
  trainNumber?: string;
  route?: { from: string; to: string };
  couponCode?: string;
  orderId?: string;
  /** Days from purchase, from phrases like "return within 7 days". */
  returnWindowDays?: number;
};

const URL = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const PHONE = /(?<![\d+])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const PNR =
  /\b(?:PNR|booking\s*(?:id|ref(?:erence)?|code|no\.?)|confirmation\s*(?:no\.?|number|code)|reservation\s*(?:id|no\.?))(?:\s*(?:No\.?|Number|#))?\s*[:\-]?\s*(\d{10}|(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,8})\b/i;
// Airline designators most common on Indian itineraries, plus major international carriers.
const FLIGHT =
  /\b(6E|AI|IX|QP|SG|UK|G8|I5|9I|S5|EK|EY|QR|SQ|LH|BA|AF|KL|TG|MH|UL|FZ|G9|WY|TK|CX|UA|AA|DL|AK)[\s-]?(\d{2,4})\b/;
const TRAIN = /\b(?:train\s*(?:no\.?|number|#)?|trn\.?)\s*[:\-]?\s*(\d{5})\b/i;
const ROUTE = /\b([A-Z]{3})\s*(?:→|->|⟶|✈|—|–|-|to)\s*([A-Z]{3})\b|\b([A-Z]{2,5})\s*(?:→|->|⟶)\s*([A-Z]{2,5})\b/;
// "FROM: DEL … TO: BLR" (a boarding-pass grid after pairLabelledCells), or a line holding
// just the two codes in separate cells.
const ROUTE_LABELLED = /\bFROM\s*:\s*([A-Z]{3})\b[\s\S]{0,80}?\bTO\s*:\s*([A-Z]{3})\b/i;
const ROUTE_CELLS = /^\s*([A-Z]{3})\t+(?:\S{1,2}\t+)?([A-Z]{3})\s*$/m;
const NOT_AIRPORTS = new Set(['THE', 'AND', 'FOR', 'GST', 'INR', 'USD', 'PNR', 'MRP', 'EMI', 'UPI', 'NEW', 'OFF', 'TAX']);
// A bare "code" needs a separator ("CODE: SWEETFREE") or a code-shaped value with a digit
// ("code STYLE20"), so "COFFEE & CODE / FRIDAY" isn't one.
const COUPON =
  /\b(?:(?:use\s+(?:promo\s*)?code|promo\s*code|coupon\s+code|voucher\s+code)\s*[:\-\t]?|coupon\s*[:\-]\s*|coupon\s+(?=[A-Z0-9]*\d)|code\s*(?::|-|\t)|code\s+(?=[A-Z]*\d))\s*["“']?([A-Za-z0-9]{4,20})\b/i;
const ORDER_ID = /\border\s*(?:id|no\.?|number|#)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{5,})/i;
const RETURN_WINDOW = /\breturn(?:able)?\s*(?:window\s*(?:of)?|within|in|policy[:\s]*)\s*(\d{1,2})\s*days?\b/i;

export function findEntities(text: string): Entities {
  const route = text.match(ROUTE) ?? text.match(ROUTE_LABELLED) ?? text.match(ROUTE_CELLS);
  const coupon = text.match(COUPON)?.[1];
  const flight = text.match(FLIGHT);
  const returnWindow = text.match(RETURN_WINDOW)?.[1];

  return {
    urls: unique([...text.matchAll(URL)].map((m) => m[0].replace(/[).,;:!?]+$/, ''))),
    emails: unique([...text.matchAll(EMAIL)].map((m) => m[0])),
    phones: unique([...text.matchAll(PHONE)].map((m) => m[0].replace(/[\s-]/g, ''))),
    pnr: text.match(PNR)?.[1].toUpperCase(),
    flightNumber: flight ? `${flight[1]} ${flight[2]}` : undefined,
    trainNumber: text.match(TRAIN)?.[1],
    route: routeOf(route),
    // Codes are printed in capitals; "use code below" is not a code.
    couponCode: coupon && /^[A-Z0-9]+$/.test(coupon) && /[A-Z]/.test(coupon) ? coupon : undefined,
    orderId: text.match(ORDER_ID)?.[1],
    returnWindowDays: returnWindow ? Number(returnWindow) : undefined,
  };
}

function routeOf(match: RegExpMatchArray | null): Entities['route'] {
  if (!match) return undefined;
  // Either the airport-style pair (groups 1–2) or the arrow-only station pair (3–4).
  const from = match[1] ?? match[3];
  const to = match[2] ?? match[4];
  if (!from || !to || from === to || NOT_AIRPORTS.has(from) || NOT_AIRPORTS.has(to)) return undefined;
  return { from, to };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
