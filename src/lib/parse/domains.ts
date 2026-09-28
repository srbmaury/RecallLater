import type { ExtractedFields, Ingredient } from '@/lib/types';

import { labelledValue } from './layout';
import { ENGAGEMENT, HANDLE, NAMED_IN_CAPTION } from './social';
import { hostOf } from './url';

/**
 * Per-kind extractors for the V1.5 collections. Each returns the fields it could
 * find plus, when the document makes it obvious, a title.
 */
export type DomainResult = { fields: Partial<ExtractedFields>; title?: string };

const CITIES =
  /\b(Bengaluru|Bangalore|Mumbai|Delhi|New Delhi|Gurugram|Gurgaon|Noida|Hyderabad|Chennai|Pune|Kolkata|Ahmedabad|Jaipur|Kochi|Chandigarh|Indore|Goa|Remote)\b/i;

// ── Jobs ────────────────────────────────────────────────────────────────────────

const ROLE =
  /\b((?:senior |sr\.? |junior |jr\.? |staff |principal |lead |associate )?(?:software|frontend|front-end|backend|back-end|full[- ]?stack|mobile|android|ios|data|ml|machine learning|devops|site reliability|qa|test|product|project|program|ux|ui|graphic|marketing|sales|business|financial|hr|content)?\s*(?:engineer|developer|designer|manager|analyst|scientist|architect|consultant|specialist|intern|lead|writer|associate)(?:\s+(?:I{1,3}|IV|[1-4]))?)\b/i;
const JOB_HOSTS = /(?:^|\.)(linkedin\.com|naukri\.com|indeed\.|glassdoor\.|greenhouse\.io|lever\.co|myworkdayjobs\.com|workday\.com|instahyre\.com|wellfound\.com|angel\.co|foundit\.in|hirist\.tech|cutshort\.io)$/i;

export function extractJob(text: string, urls: string[]): DomainResult {
  const fields: Partial<ExtractedFields> = { stage: 'saved' };
  let title: string | undefined;

  // LinkedIn slugs read "software-engineer-ii-at-stripe-3801234567".
  const slug = urls.map((u) => u.match(/\/jobs\/view\/([a-z0-9-]+?)-at-([a-z0-9-]+?)-\d{6,}/i)).find(Boolean);
  if (slug) {
    title = titleCase(slug[1].replace(/-/g, ' ')).replace(/\b(Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
    fields.company = titleCase(slug[2].replace(/-/g, ' '));
  }

  const roleLine = text.split('\n').find((line) => ROLE.test(line) && line.length <= 60);
  // Prefer a short line that is just the role; a one-paragraph message has none.
  title ??= labelledValue(text, 'role') ?? (roleLine ?? text).match(ROLE)?.[1].trim().replace(/\s+/g, ' ');

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const roleIndex = roleLine ? lines.indexOf(roleLine.trim()) : -1;
  const lineAfterRole = roleIndex >= 0 ? lines[roleIndex + 1] : undefined;
  const adjacentCompany = lineAfterRole && !/\b(?:full[- ]time|part[- ]time|remote|hybrid|on[- ]site|years? of experience)\b/i.test(lineAfterRole)
    ? lineAfterRole.split(/\s*[·|•,-]\s*/)[0].trim()
    : undefined;
  // A job card's header: "Nimbus Labs" on its own line above "Software Engineer II",
  // possibly with an "Engineering careers" line in between.
  const header = lines
    .slice(Math.max(0, roleIndex - 2), Math.max(0, roleIndex))
    .reverse()
    .find((line) => !/hiring|careers?|jobs?\b|openings?/i.test(line));
  const headerCompany =
    header && /^[A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,3}$/.test(header) && !ROLE.test(header)
      ? header === header.toUpperCase() ? titleCase(header.toLowerCase()) : header
      : undefined;
  fields.company ??=
    labelledValue(text, ['company', 'employer', 'organization', 'organisation']) ??
    text.match(/\b(?:company|organisation|organization|employer)\s*[:\-]\s*([A-Z][\w&.\- ]{1,40})/)?.[1].trim() ??
    text.match(/\bcompany\s*\n\s*([A-Z][\w&.\- ]{1,40})/i)?.[1].trim() ??
    adjacentCompany ??
    headerCompany ??
    text.match(/\bat\s+([A-Z][\w&.\-]+(?:\s[A-Z][\w&.\-]+){0,2})\b/)?.[1] ??
    // "Stripe · Bengaluru (Hybrid)": the line under the role, before a separator.
    text.split('\n').find((line, i, lines) => i > 0 && lines[i - 1] === roleLine && /[·|•,-]/.test(line))?.split(/\s*[·|•,-]\s*/)[0].trim() ??
    urls.map((u) => hostOf(u)).find((host) => host && !JOB_HOSTS.test(host))?.split('.')[0].replace(/^./, (c) => c.toUpperCase());

  fields.location = labelledValue(text, 'location') ?? text.match(CITIES)?.[1];
  return { fields: compact(fields), title };
}

export function isJobHost(url: string): boolean {
  return JOB_HOSTS.test(hostOf(url));
}

// ── Coupons ─────────────────────────────────────────────────────────────────────

const BRANDS = [
  'Swiggy', 'Zomato', 'Amazon', 'Flipkart', 'Myntra', 'Ajio', 'Nykaa', 'Meesho', 'Uber', 'Ola', 'Rapido',
  'BigBasket', 'Blinkit', 'Zepto', 'Instamart', 'PhonePe', 'Paytm', 'Google Pay', 'CRED', 'MakeMyTrip',
  'Goibibo', 'Cleartrip', "Domino's", 'Dominos', 'KFC', "McDonald's", 'Starbucks', 'BookMyShow', 'Tata Cliq',
  'Croma', 'Lenskart', 'Pharmeasy', '1mg', 'Dunzo', 'EaseMyTrip', 'IRCTC',
];
const BRAND = new RegExp(`\\b(${BRANDS.map((b) => b.replace(/[.*+?^${}()|[\]\\']/g, '\\$&')).join('|')})\\b`, 'i');
const DISCOUNT = /((?:₹|rs\.?\s?|inr\s?)?\s?\d[\d,]*|\d{1,2}\s?%)\s*(off|0ff|cashback|discount)/i;

export function extractCoupon(text: string): DomainResult {
  const offer = labelledValue(text, 'offer');
  const discount = (offer ?? text).match(DISCOUNT);
  const buyOneGetOne = /\bbuy\s*1\s*(?:get|\+|and)\s*1\b/i.test(text);
  const freeOffer = (offer ?? text).match(/\bfree\s+(dessert|delivery|item|drink|coffee|movie ticket)\b/i)?.[0];
  const couponCode = text.match(/\b(?:coupon|promo(?:tional)?)\s+code\s*[:\t]?\s*([A-Z0-9]{4,20})/i)?.[1];
  const malformedRupeeAmount = discount?.[1].trim().match(/^7(\d{3})$/)?.[1];
  const codeAmount = couponCode?.replace(/\D/g, '');
  const correctedAmount = malformedRupeeAmount && codeAmount === malformedRupeeAmount ? malformedRupeeAmount : undefined;
  const brand = text.match(BRAND)?.[1];
  const displayBrand = text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z][A-Z0-9]{3,}$/.test(line));
  const merchant = labelledValue(text, 'merchant') ?? (brand ? BRANDS.find((b) => b.toLowerCase() === brand.toLowerCase()) : displayBrand ? titleCase(displayBrand.toLowerCase()) : undefined);
  const discountText = buyOneGetOne
    ? 'Buy 1 Get 1'
    : freeOffer
      ? titleCase(freeOffer)
      : discount
        ? `${correctedAmount || /^\d[\d,]*$/.test(discount[1].trim()) ? '₹' : ''}${correctedAmount ?? discount[1].replace(/\s+/g, '')} ${discount[2].toLowerCase() === '0ff' ? 'OFF' : discount[2]}`
        : undefined;
  const title = [merchant, discountText?.replace(/\b(off)\b/i, 'OFF')].filter(Boolean).join(' · ') || undefined;
  return { fields: compact({ merchant, discount: discountText }), title };
}

// ── Places ──────────────────────────────────────────────────────────────────────

const DESTINATION = /\b(beach(?:es)?|fort|temple|lake|trek|waterfalls?|falls|museum|island|valley|hills?|national park|sanctuary|palace|backwaters|viewpoint|sunset point|monastery)\b/i;
const EATERY = /\b(restaurant|cafe|café|bistro|bar|brewery|pub|bakery|dhaba|eatery|diner|kitchen|cuisine|menu|must try|brunch|dessert|biryani|thali|dine|dining)\b/i;
const ADDRESS_LINE = /\b(road|rd\.?|street|st\.|lane|marg|nagar|layout|colony|sector|block|main|cross|circle|phase|stage)\b.*|(?<![\w-])\d{6}(?![\w-])/i;
const MAPS_URL = /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com/i;

export function extractPlace(text: string, urls: string[]): DomainResult {
  const fields: Partial<ExtractedFields> = {};
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  fields.address = lines.find((line) => ADDRESS_LINE.test(line) && /[a-z]/i.test(line))?.replace(/^📍\s*/, '');
  fields.placeKind = DESTINATION.test(text) && !EATERY.test(text) ? 'destination' : 'eat';

  const mapsPlace = urls.map((u) => u.match(/\/maps\/place\/([^/@?]+)/)?.[1]).find(Boolean);
  let title = labelledValue(text, ['restaurant', 'place name']) ?? (mapsPlace ? safeDecode(mapsPlace.replace(/\+/g, ' ')) : undefined);
  title ??= text.match(NAMED_IN_CAPTION)?.[1].trim();
  // "Gokarna: hidden beaches…" / "Gokarna — hidden beaches…": the name before the dash or colon.
  title ??= lines.find((l) => !/^https?:/i.test(l) && l !== fields.address && !HANDLE.test(l) && !ENGAGEMENT.test(l) && !/^(?:shared location|instagram|facebook|tiktok|youtube|open in maps|save this|source\b)/i.test(l))
    ?.split(/\s[—–-]\s|:\s/)[0].trim();
  return { fields: compact(fields), title: title && title.length <= 60 ? title : undefined };
}

export function isMapsUrl(url: string): boolean {
  return MAPS_URL.test(url);
}

// ── Books and shows ─────────────────────────────────────────────────────────────

export function extractBook(text: string): DomainResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // "Recommended by TechShelf" names who suggested it, not who wrote it.
  const byLine = lines.find(
    (l) => /\sby\s+[A-Z]/.test(l) && !/^(?:recommended|curated|reviewed|picked|published|narrated|translated|illustrated|shared)\b/i.test(l),
  );
  const match = byLine?.match(/^(.{2,80}?)\s+by\s+([A-Z][\w.'-]+(?:\s[A-Z][\w.'-]+){0,3})/);
  if (match) return { fields: compact({ author: match[2] }), title: match[1].trim() };
  // A cover: the title in capitals over one to three lines, then the author's name.
  const authorIndex = lines.findIndex((line) => /^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?$/.test(line));
  const titleLines = lines.slice(0, Math.max(0, authorIndex));
  if (titleLines.length >= 1 && titleLines.length <= 3 && titleLines.every((line) => /^[A-Z0-9][A-Z0-9’'&,: -]*$/.test(line))) {
    return { fields: { author: lines[authorIndex] }, title: titleCase(titleLines.join(' ').toLowerCase()) };
  }
  return { fields: {} };
}

const PLATFORMS: [RegExp, string][] = [
  [/netflix/i, 'Netflix'],
  [/prime video|primevideo|amazon prime/i, 'Prime Video'],
  [/hotstar|jiohotstar/i, 'JioHotstar'],
  [/jiocinema/i, 'JioCinema'],
  [/sonyliv/i, 'SonyLIV'],
  [/zee5/i, 'ZEE5'],
  [/apple tv/i, 'Apple TV+'],
  [/youtube/i, 'YouTube'],
  [/in (?:cinemas|theatres|theaters)/i, 'In cinemas'],
];

export function extractWatch(text: string): DomainResult {
  const platform = PLATFORMS.find(([pattern]) => pattern.test(text))?.[1];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^https?:/i.test(l));
  const isDisplayTitle = (line: string) => /^[A-Z][A-Z0-9 ]{2,}$/.test(line) &&
    !/^(?:A NEW .+|ADD TO WATCHLIST|DRAMA(?:\s*[·.]?\s*\d+ EPISODES?)?|DOCUMENTARY|THRILLER|MYSTERY|LIMITED SERIES|SCI-?FI|\d+ EPISODES?)$/i.test(line);
  const candidates = lines.filter(isDisplayTitle);
  // Posters sometimes put a studio wordmark above a one-word title.
  const first = candidates.length > 1 && candidates[0].split(/\s+/).length === 1
    ? candidates[1]
    : candidates[0] ?? lines[0];
  const title = first
    ?.split(/\s+(?:is\s+)?(?:now\s+)?(?:streaming|available|out now|releasing|coming)\b|\s+(?:now\s+)?on\s+(?:netflix|prime|hotstar|jio|sony|zee|apple|youtube)/i)[0]
    .replace(/[,.:—–-]+$/, '')
    .trim();
  return { fields: compact({ platform }), title: title && title.length <= 60 ? title : undefined };
}

// ── Recipes ─────────────────────────────────────────────────────────────────────

const QUANTITY = /^(?:\d+(?:[./]\d+)?|½|¼|¾|a|an|one|two|few|pinch)\b/i;
const UNIT = /\b(g|gm|grams?|kg|ml|l|litres?|cups?|tbsp|tsp|teaspoons?|tablespoons?|pinch|cloves?|inch|pieces?|nos?)\b/i;

export function extractRecipe(text: string): DomainResult {
  const lines = text.split('\n').map((l) => l.trim());
  const metricsIndex = lines.findIndex((line) => /\b\d+\s*min\b/i.test(line) && /\b(?:serves?|servings?|easy|medium|hard)\b/i.test(line));
  const title = labelledValue(text, ['dish', 'recipe name']) ?? (metricsIndex > 0 ? lines[metricsIndex - 1] : undefined);
  const start = lines.findIndex((l) => /^ingredients\b/i.test(l));
  const labelledIngredients = labelledValue(text, 'ingredients');
  const ingredients: Ingredient[] = labelledIngredients
    ? labelledIngredients.split(/[,;]+/).map((item) => item.trim()).filter(Boolean).map((item) => ({ text: item, done: false }))
    : [];
  for (const line of labelledIngredients ? [] : start >= 0 ? lines.slice(start + 1) : lines) {
    if (/^(method|instructions|directions|steps|preparation|how to make)\b/i.test(line)) break;
    const ingredientCell = start >= 0 ? line.split('\t')[0] : line;
    const item = ingredientCell.replace(/^[-•*·▪◦]\s*|^\d+\)\s*/, '').trim();
    const bulleted = item !== line;
    if (!item || /^\d+\.\s/.test(line)) continue;
    // Outside an "Ingredients" section, only lines that look like quantities count.
    if (start >= 0 ? bulleted || QUANTITY.test(item) || UNIT.test(item) || item.split(' ').length <= 4 : bulleted && item.split(' ').length <= 5 || QUANTITY.test(item) && UNIT.test(item)) {
      ingredients.push({ text: item, done: false });
    }
  }
  return { fields: ingredients.length ? { ingredients } : {}, title: title && title.length <= 60 ? title : undefined };
}

// ── Warranties ──────────────────────────────────────────────────────────────────

/** "Warranty: 1 year", "2 years warranty", "6 months manufacturer warranty" → months. */
export function warrantyMonths(text: string): number | undefined {
  const match =
    text.match(/warranty\s+months?\s*[:\t-]\s*(\d{1,2})/i) ??
    text.match(/warranty\s*(?:of|:|-|period)?\s*(\d{1,2})\s*(years?|yrs?|months?)/i) ??
    text.match(/(\d{1,2})\s*[- ]\s*(years?|yrs?|months?)\s+(?:\w+\s+)?warranty/i) ??
    text.match(/(\d{1,2})\s*(years?|yrs?|months?)\s+(?:\w+\s+)?warranty/i);
  if (!match) return undefined;
  return Number(match[1]) * (/^y/i.test(match[2]) ? 12 : 1);
}

// ── QR payloads ─────────────────────────────────────────────────────────────────

export function parseQrPayload(raw: string): DomainResult {
  if (/^WIFI:/i.test(raw)) {
    const field = (key: string) => raw.match(new RegExp(`[:;]${key}:((?:\\\\.|[^;])*)`, 'i'))?.[1].replace(/\\(.)/g, '$1');
    const ssid = field('S');
    if (!ssid) return { fields: {} };
    return {
      fields: { wifi: compact({ ssid, password: field('P'), security: field('T') }) as { ssid: string } },
      title: `Wi-Fi: ${ssid}`,
    };
  }
  if (/^BEGIN:VCARD/i.test(raw) || /^MECARD:/i.test(raw)) {
    const value = (pattern: RegExp) => raw.match(pattern)?.[1].trim();
    const name =
      value(/^FN[^:\n]*:(.+)$/im) ??
      value(/MECARD:N:([^;]+)/i)?.split(',').reverse().join(' ').trim() ??
      value(/^N[^:\n]*:(.+)$/im)?.split(';').filter(Boolean).reverse().join(' ');
    const contact = compact({
      name,
      phone: value(/(?:^TEL[^:\n]*:|[:;]TEL:)([+\d][\d\s-]+)/im)?.replace(/[\s-]/g, ''),
      email: value(/(?:^EMAIL[^:\n]*:|[:;]EMAIL:)([^;\s]+)/im),
    });
    return { fields: { contact }, title: name };
  }
  if (/^upi:\/\/pay/i.test(raw)) {
    const params = new Map(
      raw
        .split('?')[1]
        ?.split('&')
        .map((pair) => pair.split('=').map(safeDecode) as [string, string]) ?? [],
    );
    const payee = params.get('pa');
    if (!payee) return { fields: {} };
    const name = params.get('pn');
    const amount = params.has('am') ? Number(params.get('am')) : undefined;
    return {
      fields: { upi: compact({ payee, name, amount: Number.isFinite(amount) ? amount : undefined }) as { payee: string } },
      title: `UPI: ${name ?? payee}`,
    };
  }
  return { fields: {} };
}

// ── helpers ─────────────────────────────────────────────────────────────────────

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T;
}
