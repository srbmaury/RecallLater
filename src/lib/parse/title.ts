import type { ExtractedFields, ItemType } from '@/lib/types';

import { labelledValue } from './layout';
import { hostOf } from './url';

const BILL_KINDS: [RegExp, string][] = [
  [/electricity|\bpower\b|bescom|msedcl|tneb|tata power|adani electricity|bses/i, 'Electricity Bill'],
  [/broadband|internet|fiber|fibre|wi-?fi/i, 'Internet Bill'],
  [/postpaid|mobile bill|airtel|jio|\bvi\b|vodafone/i, 'Mobile Bill'],
  [/credit card/i, 'Credit Card Bill'],
  [/water/i, 'Water Bill'],
  [/\bgas\b|\blpg\b|\bpng\b/i, 'Gas Bill'],
  [/rent\b/i, 'Rent'],
  [/insurance|premium/i, 'Insurance Premium'],
];

const NOISE_LINE =
  /^(?:tax invoice|invoice|receipt|bill of supply|original for recipient|boarding pass|e-?ticket|order summary|order confirmed|(?:event|message|recipe|job|order|coupon|restaurant|bill|receipt) document|synthetic recallLater test document|limited warranty certificate|warranty certificate|warranty registration summary|details|shared location|messages?|chats?|whatsapp|instagram|facebook|tiktok|youtube|amazon|flipkart|myntra|today|yesterday)$/i;

const MAX_TITLE = 60;

export function buildTitle(type: ItemType, text: string, fields: ExtractedFields, domainTitle?: string): string {
  switch (type) {
    case 'bill':
      return BILL_KINDS.find(([pattern]) => pattern.test(text))?.[1] ?? withSuffix(firstMeaningfulLine(text), 'bill', 'Bill');
    case 'travel':
      if (fields.from && fields.to) return `${fields.from} → ${fields.to}`;
      if (fields.flightNumber) return `Flight ${fields.flightNumber}`;
      if (fields.trainNumber) return `Train ${fields.trainNumber}`;
      return firstMeaningfulLine(text) ?? 'Trip';
    case 'task':
      return taskTitle(text) ?? 'Follow up';
    case 'purchase':
    case 'receipt':
      return (type === 'receipt' ? labelledValue(text, ['product', 'item']) ?? text.match(/(?:limited )?warranty certificate\s*\n([^\n]+)/i)?.[1]?.trim() ?? titleFromOrder(text) : undefined) ?? titleFromUrl(fields.urls?.[0]) ?? firstMeaningfulLine(text) ?? (type === 'receipt' ? 'Receipt' : 'Saved product');
    case 'event':
      return labelledValue(text, ['event name', 'event']) ?? firstMeaningfulLine(text) ?? 'Event';
    case 'job':
      return domainTitle ?? firstMeaningfulLine(text) ?? 'Job';
    case 'coupon':
      return domainTitle ?? (fields.couponCode ? `Code ${fields.couponCode}` : undefined) ?? firstMeaningfulLine(text) ?? 'Coupon';
    case 'place':
    case 'book':
    case 'watch':
      return domainTitle ?? titleFromUrl(fields.urls?.[0]) ?? firstMeaningfulLine(text) ?? TYPE_FALLBACK[type];
    case 'recipe':
      return domainTitle ?? firstMeaningfulLine(text) ?? 'Recipe';
    case 'generic':
      return domainTitle ?? titleFromUrl(fields.urls?.[0]) ?? firstMeaningfulLine(text) ?? 'Saved item';
  }
}

function titleFromOrder(text: string): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const orderLine = lines.findIndex((line) => /^order\s*(?:#|id\b|no\b|number\b)/i.test(line));
  if (orderLine < 0) return undefined;
  const candidate = lines.slice(orderLine + 1).find((line) =>
    line.length >= 4 && /[a-z]{3}/i.test(line) && !/^(?:delivered|return|view order|order confirmed|https?:)/i.test(line) &&
    !/^[\d₹$.,%\s/-]+$/.test(line),
  );
  if (!candidate) return undefined;
  const next = lines[lines.indexOf(candidate) + 1];
  const detail = next && /^(?:\d{1,3}\s*[x×]\s*\d{1,3}|\d{1,4}\s?(?:gb|tb|mm|cm|inch(?:es)?))$/i.test(next) ? ` ${next}` : '';
  return `${candidate}${detail}`;
}

const TYPE_FALLBACK = { place: 'Place', book: 'Book', watch: 'To watch' };

/**
 * Turns an ask into a to-do: "Can you send me the updated deck before we speak
 * on Friday?" becomes "Send updated deck".
 */
export function taskTitle(text: string): string | undefined {
  const taskText = labelledValue(text, 'task') ?? text;
  const sentences = taskText.split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const ask =
    sentences.find((s) => /\b(?:can|could|would|will) you\b|\bplease\b|\bpls\b|remind me|don'?t forget|remember to|need to/i.test(s)) ??
    sentences[0];
  if (!ask) return undefined;

  const phrase = ask
    .replace(/^(?:hey|hi|hello)\b[^,!]*[,!]\s*/i, '')
    .replace(
      /^(?:(?:can|could|would|will) you(?:\s+(?:please|pls|plz|also))?|please|pls|plz|kindly|remind me to|don'?t forget to|remember to|make sure (?:to|you)|i need to|need to|have to)\s+/i,
      '',
    )
    .replace(/^(?:please|pls|plz)\s+/i, '')
    .replace(/^(\w+)\s+(?:me|us)\s+/i, '$1 ')
    .replace(/^(\w+(?:\s+(?:up|out|over|back))?)\s+(?:the|a|an)\s+/i, '$1 ')
    .split(/\s+(?:before|by|on|tomorrow|today|tonight|when|after|asap|once|so that)\b|[?.!,;]/i)[0]
    .trim();

  return phrase.length >= 3 ? truncate(capitalize(phrase)) : undefined;
}

export function titleFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const path = url.replace(/^(?:https?:\/\/)?[^/]+/i, '').split(/[?#]/)[0];
  const segments = path.split('/').map(safeDecode).filter((s) => /[a-z]{3}/i.test(s) && /[-_ ]/.test(s));
  const slug = segments.sort((a, b) => b.length - a.length)[0];
  if (!slug) return hostOf(url) || undefined;
  const words = slug
    .replace(/\.[a-z]{2,5}$/i, '')
    .split(/[-_\s]+/)
    // Drop catalogue IDs ("B0CXYZ1234", "itm6f2a91c3") but keep model names ("1000XM6").
    .filter((w) => w && !(w.length >= 9 && /\d/.test(w) && /[a-z]/i.test(w)))
    .slice(0, 8);
  return truncate(words.map(capitalize).join(' '));
}

function firstMeaningfulLine(text: string): string | undefined {
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 4 || NOISE_LINE.test(line)) continue;
    // Skip status bars, bare dates/amounts/codes and links.
    if (!/[a-z]{3}/i.test(line) || /^https?:\/\/|^www\./i.test(line)) continue;
    if (/^[\d\s:.,/₹$%+-]+[a-z]{0,3}$/i.test(line)) continue;
    return truncate(line);
  }
  return undefined;
}

function withSuffix(line: string | undefined, suffix: string, fallback: string): string {
  if (!line || line.length > 30) return fallback;
  return new RegExp(`\\b${suffix}\\b`, 'i').test(line) ? line : `${line} ${suffix}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncate(value: string): string {
  return value.length > MAX_TITLE ? `${value.slice(0, MAX_TITLE - 1).trimEnd()}…` : value;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
