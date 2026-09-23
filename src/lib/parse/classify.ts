import type { ItemType } from '@/lib/types';

import type { DateMatch } from './dates';
import type { Entities } from './entities';
import type { AmountMatch } from './money';

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
  ],
  travel: [
    [/boarding pass|e-?ticket|itinerary|booking (?:ref|reference|id)|reservation/i, 2],
    [/\bflight\b|airlines?|\bgate\b|\bseat\b|terminal|departure|arrival|check-?in/i, 2],
    [/irctc|\btrain\b|\bcoach\b|\bberth\b|\bplatform\b|\bbus\b|\bredbus\b/i, 2],
    [/hotel|check-?out|\bnights?\b|guests?/i, 1],
  ],
  event: [
    [/\bvenue\b|\brsvp\b|register(?:\s+now)?|registration|tickets? (?:on|at)|doors open|join us|save the date/i, 3],
    [/conference|meetup|summit|webinar|workshop|concert|festival|\bfest\b|hackathon|exhibition|screening|launch/i, 2],
    [/\binterview\b|\bappointment\b|\bmeeting\b|\bparty\b|wedding|birthday/i, 2],
  ],
  receipt: [
    [/tax invoice|\binvoice\b|\breceipt\b|\bgstin\b|order summary/i, 3],
    [/payment (?:successful|received)|paid|transaction id|txn id|thank you for (?:your )?(?:order|purchase|shopping)/i, 2],
    [/warranty|return (?:policy|window)|delivered|order (?:id|no|number)/i, 2],
  ],
  purchase: [
    [/add to cart|buy now|in stock|out of stock|deal of the day|limited time deal|free delivery|m\.?r\.?p/i, 3],
    [/\b\d{1,2}% off\b|customer reviews|\bratings?\b|\bemi\b|delivery by/i, 2],
  ],
  task: [
    [/^(?:hey|hi|hello)\b|\b(?:can|could|would|will) you\b|\bplease\b|\bpls\b|\bplz\b|\bkindly\b/i, 2],
    [/remind me|don'?t forget|remember to|\bto-?do\b|need to|have to|make sure/i, 3],
    [/\b(?:send|share|call|reply|email|submit|review|finish|book|pay|buy|pick up|drop|bring|renew|update|fix)\b/i, 1],
  ],
};

const SHOPPING_HOSTS = /(?:^|\.)(amazon\.|flipkart\.com|myntra\.com|ajio\.com|meesho\.com|nykaa\.com|croma\.com|reliancedigital\.in|tatacliq\.com|snapdeal\.com|ebay\.|etsy\.com|bestbuy\.com|walmart\.com)/i;

export type Classification = { type: ItemType; confidence: number; scores: Record<ItemType, number> };

export function classify({ text, dates, amounts, entities }: Signals): Classification {
  const scores: Record<ItemType, number> = { bill: 0, task: 0, event: 0, travel: 0, receipt: 0, purchase: 0, generic: 1 };

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
  if (hasAmount && scores.purchase > 0) scores.purchase += 1;

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

export function hostOf(url: string): string {
  const match = url.match(/^(?:https?:\/\/)?([^/?#]+)/i);
  return (match?.[1] ?? '').replace(/^www\./, '').toLowerCase();
}
