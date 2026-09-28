import { ITEM_TYPES, type ItemType } from '@/lib/types';

import type { DateMatch } from './dates';
import { isJobHost, isMapsUrl } from './domains';
import type { Entities } from './entities';
import type { AmountMatch } from './money';
import { hostOf } from './url';

type Signals = {
  text: string;
  dates: DateMatch[];
  amounts: AmountMatch[];
  entities: Entities;
};

type Rule = [pattern: RegExp, weight: number];

const KEYWORDS: Record<Exclude<ItemType, 'generic'>, Rule[]> = {
  bill: [
    [/\bbill\b|\bbilling\b/i, 2],
    [/amount due|total due|amount payable|net payable|pay(?:able)? by|due date|last date/i, 3],
    [/electricity|broadband|postpaid|water|gas connection|credit card statement|minimum (?:amount )?due|consumer (?:no|number)|account no|\bca no\b|\bk no\b/i, 2],
    [/late (?:payment )?fee|disconnection|autopay/i, 1],
    // An instruction to pay something recurring: "Pay gas bill ₹850 today", "pay rent tonight".
    [/\bpay\b[^\n]{0,40}?\b(?:bill|rent|emi|fees?|premium|dues|invoice|recharge|subscription|maintenance)\b/i, 3],
  ],
  travel: [
    [/boarding pass|e-?ticket|itinerary|booking (?:ref|reference|id)|reservation/i, 2],
    [/\bflight\b|airlines?|\bgate\b|\bseat\b|terminal|departure|arrival|check-?in/i, 2],
    [/irctc|\btrain\b|\bcoach\b|\bberth\b|\bplatform\b|\bbus\b|\bredbus\b/i, 2],
    [/hotel|check-?out|\bnights?\b|guests?/i, 1],
  ],
  event: [
    [/\bevent name\s*[:\t]/i, 3],
    [/tickets?\s+from\s+(?:₹|rs\.?\s*)?\d/i, 3],
    [/\bvenue\b|\brsvp\b|register(?:\s+now)?|registration|tickets? (?:on|at)|doors open|gates open|entry pass|\bentry\s*(?:fee)?\s*[:\-]?\s*₹\s?\d|join us|save the date/i, 3],
    [/conference|meetup|summit|webinar|workshop|concert|festival|\bfest\b|hackathon|exhibition|screening|launch/i, 2],
    [/\bpresents\b|live music|\bonwards\b|early bird|\bline-?up\b/i, 2],
    [/\binterview\b|\bappointment\b|\bmeeting\b|\bparty\b|wedding|birthday/i, 2],
  ],
  receipt: [
    [/\border document\b|\bwarranty certificate\b|\bwarranty registration summary\b|\binvoice id\b/i, 3],
    [/tax invoice|\binvoice\b|\breceipt\b|\bgstin\b|order summary|order confirmed/i, 3],
    [/payment (?:successful|received)|paid|transaction id|txn id|thank you for (?:your )?(?:order|purchase|shopping)/i, 2],
    [/warranty|return (?:policy|window)|delivered|order (?:id|no|number)/i, 2],
    // Paid at the counter: "Cashier: Asha", "Paid via UPI", "Payment Mode: Cash".
    [/\bcashier\b|\bpaid (?:via|by|using)\b|\bpayment mode\b|\bpayment\s*:\s*(?:upi|cash|card)|thank you for (?:visiting|dining)/i, 3],
    // Updates about an order already placed.
    [/\btrack order\b|out for delivery|order placed|estimated delivery|return request|return reference|order amount/i, 3],
  ],
  purchase: [
    [/add to cart|buy now|in stock|out of stock|deal of the day|limited time deal|free delivery|m\.?r\.?p/i, 3],
    [/\b\d{1,2}% off\b|customer reviews|\(\d[\d,.]*k?\s*reviews?\)|\bratings?\b|\bemi\b|delivery by|\bbestseller\b|\bwishlist\b/i, 2],
  ],
  job: [
    [/\bjob document\b|\bcompany\s*[:\t]|\brole\s*[:\t]/i, 3],
    [/we'?re hiring|now hiring|job description|job id|apply (?:now|here|by)|careers?\b|open (?:role|position)/i, 3],
    [/last date to apply|application deadline|scholarship|admissions? open/i, 3],
    [/responsibilities|requirements|qualifications|years? of experience|\d\+?\s*(?:yrs|years)\b|full[- ]time|internship|\bctc\b|\blpa\b|hybrid|on-?site/i, 2],
    [/\b(?:engineer|developer|designer|analyst|scientist|intern)\b/i, 1],
  ],
  coupon: [
    [/\bcoupon document\b|\boffer\s*[:\t]/i, 3],
    [/use code|promo ?code|coupon|voucher|cashback|offer valid|t&c apply/i, 3],
    [/\b\d{1,2}\s?% off\b|(?:₹|rs\.?)\s?\d[\d,]*\s?off\b|\bflat \d/i, 2],
  ],
  place: [
    [/\brestaurant document\b|\brestaurant\s*[:\t]/i, 3],
    [/(?:^|\n)instagram\n[^\n]+\n(?:bengaluru|bangalore|mumbai|delhi|pune|chennai|kolkata|jaipur|goa|kochi|hyderabad)[^\n]*\n[\s\S]{0,180}\b(?:menu|pasta|espresso|desserts?|coffee|cuisine|baked|kitchen|restaurant|cafe)\b/i, 4],
    [/\bshared location\b/i, 4],
    // A restaurant booking, not a trip: "Reservation confirmation · Table confirmed".
    [/\btable (?:confirmed|booked|reserved|for \d)|\bdining reservation\b/i, 4],
    [/restaurant|\bcaf[eé]\b|bistro|brewery|\bpub\b|bakery|dhaba|cuisine|must (?:try|visit)|brunch|dine-?in/i, 3],
    [/\bsave this for (?:your )?next trip\b|\bbucket list\b/i, 3],
    [/\b(?:beach(?:es)?|fort|temple|lake|trek|waterfalls?|museum|island|valley|national park|backwaters|monastery|hidden gem)\b/i, 3],
    [/\b\d{6}\b|\b(?:road|rd\.?|street|lane|marg|nagar|layout|colony|sector)\b/i, 1],
  ],
  book: [
    [/paperback|hardcover|kindle edition|\bisbn\b|\bnovel\b|audiobook|bestseller|goodreads|\bauthor\b/i, 3],
    [/\S\s+by\s+[A-Z][a-z]+\s+[A-Z][a-z]+/, 2],
    [/^(?:[A-Z][A-Z0-9’'&,: -]*\n){1,3}[A-Z][a-z]+\s+[A-Z][a-z]+$/m, 3],
  ],
  watch: [
    [/\bseason \d+|\bepisode\b|web series|\bmovie\b|\bfilm\b|trailer|streaming|\bimdb\b|in (?:cinemas|theatres)|add to watchlist|limited series|\d+ episodes?/i, 3],
    [/netflix|prime video|hotstar|jiocinema|sonyliv|zee5|apple tv/i, 2],
  ],
  recipe: [
    [/\brecipe document\b|\bdish\s*[:\t]/i, 3],
    [/\bingredients\b/i, 4],
    [/\bserves?\s+\d[\s\S]{0,120}\b(?:tbsp|tsp|cups?|grams?|ml)\b/i, 3],
    [/\b(?:tbsp|tsp|preheat|prep time|cook time|serves \d|recipe|marinate|simmer|saut[eé])\b/i, 2],
  ],
  task: [
    [/\btask\s*[:\t]|\bdeadline text\s*[:\t]/i, 3],
    [/^(?:hey|hi|hello)\b|\b(?:can|could|would|will) you\b|\bplease\b|\bpls\b|\bplz\b|\bkindly\b/i, 2],
    [/remind me|don'?t forget|remember to|\bto-?do\b|need to|have to|make sure/i, 3],
    // Something to give back: "Borrowing Reminder … please return it by 8 Oct".
    [/borrowing reminder|\blibrary\b[\s\S]{0,200}\breturn\b|please return (?:it|the (?:book|item))/i, 5],
    [/\b(?:send|share|call|reply|email|submit|review|finish|book|pay|buy|pick up|drop|bring|renew|update|fix)\b/i, 1],
  ],
};

const SHOPPING_HOSTS = /(?:^|\.)(amazon\.|flipkart\.com|myntra\.com|ajio\.com|meesho\.com|nykaa\.com|croma\.com|reliancedigital\.in|tatacliq\.com|snapdeal\.com|ebay\.|etsy\.com|bestbuy\.com|walmart\.com)/i;

type Classification = { type: ItemType; confidence: number; scores: Record<ItemType, number> };

// An event booking or invitation, not a trip: "Event Confirmation", "Event: …", "your interview schedule".
const EVENT_BOOKING = /\bevent confirmation\b|\bevent\s*:\s*\S|\binterview (?:schedule|is scheduled)\b/i;
// The parts of a till receipt. Any three together make it one, whatever the shop sells.
const RECEIPT_PARTS: ((text: string) => boolean)[] = [
  (t) => /\bsub\s?-?\s?total\b|\bsubtotal\b|\bsub\s?ttl\b/i.test(t),
  (t) => /\b(?:sales\s)?tax\b|\btxtl\b|\bgst\b|\bvat\b|\btva\b/i.test(t),
  (t) => /\btotal\b|\btotl\b|\bttl\b|\bbalance due\b|\bamount due\b/i.test(t),
  (t) => /\b(?:visa|mastercard|master card|amex|discover|debit|credit|cash|change|chng|tender(?:ed)?|approved|auth(?:orization)?(?: code)?|card type|upi)\b/i.test(t),
  (t) => /\b(?:server|cashier|caisse|table|guests?|check\s?#?\s?\d|chk|order\s?#|ticket\s?#|trans(?:action)?\s?(?:id|#|type|key)|register|terminal)\b/i.test(t),
  (t) => /\btip\b|\bgratuity\b|thank(?:s| you)/i.test(t),
  // Priced line items: four or more lines that end in an amount ("1 Coffee\t3.00").
  (t) => (t.match(/^.*[a-z]{2}.*[\s\t][$S]?\d{1,4}[.,]\d{2}-?\s*$/gim)?.length ?? 0) >= 4,
];
const CINEMA = /\bscreen \d|\baudi(?:torium)? ?\d|\bcinemas?\b|\bcineplex\b|\bmovie tickets?\b|\bshowtime\b/i;
const TABLE_BOOKING = /\b(?:dinner|lunch|brunch|table) (?:booking|reservation)\b|\btable booked\b|\bparty size\b|\btable (?:no|number)\b|\byour table\b/i;

export function classify({ text, dates, amounts, entities }: Signals): Classification {
  const scores = Object.fromEntries(ITEM_TYPES.map((t) => [t, t === 'generic' ? 1 : 0])) as Record<ItemType, number>;

  for (const [type, rules] of Object.entries(KEYWORDS) as [Exclude<ItemType, 'generic'>, Rule[]][]) {
    for (const [pattern, weight] of rules) {
      if (pattern.test(text)) scores[type] += weight;
    }
  }

  const hasAmount = amounts.length > 0;
  const labels = new Set(dates.map((d) => d.label));
  const hasTimedDate = dates.some((d) => d.time);

  if (entities.pnr) scores.travel += 3;
  if (entities.flightNumber) scores.travel += 3;
  if (entities.trainNumber) scores.travel += 2;
  if (entities.route) scores.travel += 3;
  if (labels.has('departure')) scores.travel += 1;

  if (hasAmount && labels.has('due')) scores.bill += 3;
  if (hasAmount && labels.has('purchase')) scores.receipt += 2;
  if (entities.returnWindowDays || labels.has('return')) scores.receipt += 2;
  if (entities.orderId) scores.receipt += 1;

  if (hasTimedDate && !hasAmount) scores.event += 1;

  if (entities.urls.some((url) => SHOPPING_HOSTS.test(hostOf(url)))) scores.purchase += 4;
  if (entities.urls.some((url) => isJobHost(url) || /\/(?:jobs?|careers?)\//i.test(url))) scores.job += 5;
  if (entities.urls.some(isMapsUrl) || entities.urls.some((url) => /zomato\.com|tripadvisor\.|dineout/i.test(url))) scores.place += 5;
  if (entities.urls.some((url) => /goodreads\.com/i.test(url))) scores.book += 5;
  if (entities.urls.some((url) => /imdb\.com|netflix\.com|primevideo\.com|hotstar\.com|letterboxd\.com/i.test(url))) scores.watch += 5;
  if (entities.couponCode) scores.coupon += 3;
  // Coupons carry amounts and expiry dates too; don't let them read as bills.
  if (scores.coupon >= 3) scores.bill = Math.max(0, scores.bill - 3);
  if (hasAmount && scores.purchase > 0) scores.purchase += 1;

  // A restaurant's bill is still a receipt: the parts of one outweigh talk of food. A booking
  // with a payment summary (a table, a show, an event) stays a booking.
  const isBooking =
    CINEMA.test(text) || EVENT_BOOKING.test(text) || (TABLE_BOOKING.test(text) && /\breserv|\bbook(?:ed|ing)\b|\bconfirmed\b/i.test(text));
  if (!isBooking && RECEIPT_PARTS.filter((part) => part(text)).length >= 3) {
    scores.receipt += 6;
    scores.place = Math.max(0, scores.place - 3);
  }

  // Seats and reservations aren't only for trips: a film show or a restaurant table.
  if (CINEMA.test(text)) {
    scores.event += 5;
    scores.travel = Math.max(0, scores.travel - 3);
  }
  if (EVENT_BOOKING.test(text)) {
    scores.event += 5;
    scores.travel = Math.max(0, scores.travel - 3);
  }
  if (TABLE_BOOKING.test(text)) {
    scores.place += 5;
    scores.travel = Math.max(0, scores.travel - 3);
  }

  // Chat messages are short and mostly asks; long OCR'd documents rarely are.
  const isShort = text.length < 280;
  if (isShort && (dates.some((d) => d.relative) || labels.has('due'))) scores.task += 1;
  if (!isShort) scores.task = Math.max(0, scores.task - 2);
  if (hasAmount) scores.task = Math.max(0, scores.task - 1);

  const ranked = (Object.entries(scores) as [ItemType, number][]).sort((a, b) => b[1] - a[1]);
  const [[topType, top], [, second]] = ranked;
  if (top < 3) {
    return { type: 'generic', confidence: 0.3, scores };
  }
  // Confidence grows with the lead over the runner-up, capped below certainty.
  const confidence = Math.min(0.97, 0.5 + (top - second) / (top + 2));
  return { type: topType, confidence: Math.round(confidence * 100) / 100, scores };
}
