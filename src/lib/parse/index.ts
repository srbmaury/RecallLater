import { addDays, addMonths, parseLocalDateTime, startOfDay, toDateKey } from '@/lib/dates';
import type { Barcode, ExtractedFields, ItemType, LocalDateTime } from '@/lib/types';

import { classify } from './classify';
import { type DateLabel, type DateMatch, findDates, findTimes } from './dates';
import {
  type DomainResult,
  extractBook,
  extractCoupon,
  extractJob,
  extractPlace,
  extractRecipe,
  extractWatch,
  parseQrPayload,
  warrantyMonths,
} from './domains';
import { findEntities } from './entities';
import { pairLabelledCells } from './layout';
import { findRepeat } from './repeat';
import { normalizeOcr } from './normalize';
import { findAmounts, findBarePrice, primaryAmount } from './money';
import { type CalendarSuggestion, type ReminderSuggestion, suggestCalendar, suggestReminder } from './suggest';
import { buildTitle } from './title';

export type { CalendarSuggestion, ReminderSuggestion };

export type AnalyzeInput = {
  text: string;
  barcodes?: Barcode[];
  now?: Date;
  /** Skip classification, e.g. after the user picked a different type on the review screen. */
  type?: ItemType;
};

export type Analysis = {
  type: ItemType;
  title: string;
  confidence: number;
  fields: ExtractedFields;
  /** The date that matters most for this item, used to sort and to show "due tomorrow". */
  keyDate?: LocalDateTime;
  reminder: ReminderSuggestion | null;
  calendar: CalendarSuggestion | null;
};

/**
 * Deterministic understanding of a shared item: no network, no model. Anything it
 * can't place becomes a `generic` item the user can still save and remind on.
 */
export function analyze({ text, barcodes = [], now = new Date(), type: forcedType }: AnalyzeInput): Analysis {
  const normalized = pairLabelledCells(normalizeOcr(text.replace(/\r\n?/g, '\n')));
  const dates = findDates(normalized, now);
  const amounts = findAmounts(normalized);
  const entities = findEntities(normalized);
  const barcodeUrls = barcodes.map((b) => b.rawValue).filter((v) => /^https?:\/\//i.test(v));

  const qr = barcodes.map((b) => parseQrPayload(b.rawValue)).find((r) => r.title) ?? { fields: {} };
  const structuredQrType = barcodes.some((b) => /^(?:WIFI:|BEGIN:VCARD|MECARD:|upi:\/\/pay)/i.test(b.rawValue));
  const classification = forcedType
    ? { type: forcedType, confidence: 1 }
    : structuredQrType
      ? { type: 'generic' as const, confidence: 0.8 }
    : classify({ text: normalized, dates, amounts, entities: { ...entities, urls: [...entities.urls, ...barcodeUrls] } });
  const { type } = classification;

  // A coupon's amount is its discount, already captured as `discount`.
  const barePrice = type === 'purchase' ? findBarePrice(normalized) : undefined;
  const amount = type === 'coupon'
    ? undefined
    : type === 'purchase'
      ? (barePrice ?? amounts[0] ?? primaryAmount(amounts))
      : (primaryAmount(amounts) ?? (type === 'receipt' ? findBarePrice(normalized) : undefined));
  const urls = [...new Set([...entities.urls, ...barcodeUrls])];
  const domain = extractDomain(type, normalized, urls);
  const fields: ExtractedFields = compact({
    amount: amount?.amount,
    currency: amount?.currency,
    from: entities.route?.from,
    to: entities.route?.to,
    flightNumber: entities.flightNumber,
    trainNumber: entities.trainNumber,
    pnr: entities.pnr,
    orderId: entities.orderId,
    couponCode: entities.couponCode,
    urls: nonEmpty(urls),
    emails: nonEmpty(entities.emails),
    phones: nonEmpty(entities.phones),
    barcodes: nonEmpty(barcodes),
    ...pickDates(type, dates, now, entities.returnWindowDays, normalized),
    repeat: findRepeat(type, normalized),
    ...qr.fields,
    ...domain.fields,
  });
  const months = type === 'receipt' || type === 'purchase' ? warrantyMonths(normalized) : undefined;
  if (months && !fields.warrantyUntil) {
    const from = fields.purchasedOn ? parseLocalDateTime(fields.purchasedOn) : startOfDay(now);
    fields.warrantyUntil = toDateKey(addMonths(from, months));
  }

  const title = buildTitle(type, normalized, fields, domain.title ?? qr.title);
  const keyDate = keyDateOf(fields);
  return {
    type,
    title,
    confidence: classification.confidence,
    fields,
    keyDate,
    reminder: suggestReminder(type, fields, now),
    calendar: suggestCalendar(type, title, fields),
  };
}

function extractDomain(type: ItemType, text: string, urls: string[]): DomainResult {
  switch (type) {
    case 'job':
      return extractJob(text, urls);
    case 'coupon':
      return extractCoupon(text);
    case 'place':
      return extractPlace(text, urls);
    case 'book':
      return extractBook(text);
    case 'watch':
      return extractWatch(text);
    case 'recipe':
      return extractRecipe(text);
    default:
      return { fields: {} };
  }
}

/** The date that matters most for an item: when it's due, starts, or runs out. */
export function keyDateOf(fields: ExtractedFields): LocalDateTime | undefined {
  return fields.dueDate ?? fields.startsAt ?? fields.returnBy ?? fields.expiresOn;
}

function pickDates(
  type: ItemType,
  dates: DateMatch[],
  now: Date,
  returnWindowDays: number | undefined,
  text: string,
): Partial<ExtractedFields> {
  const today = startOfDay(now);
  const upcoming = dates.filter((d) => parseLocalDateTime(d.date).getTime() >= today.getTime());
  const labelled = (label: DateLabel) => dates.find((d) => d.label === label);
  const unlabelledUpcoming = upcoming.find((d) => d.label === 'none' || d.label === 'due');

  const purchasedOn = labelled('purchase');
  const returnBy =
    labelled('return') ??
    (returnWindowDays && { date: toDateKey(addDays(purchasedOn ? parseLocalDateTime(purchasedOn.date) : today, returnWindowDays)) });

  const result: Partial<ExtractedFields> = {
    purchasedOn: purchasedOn && toLocal(purchasedOn),
    returnBy: returnBy ? toLocal(returnBy) : undefined,
    expiresOn: labelled('expiry') && toLocal(labelled('expiry')!),
    warrantyUntil: labelled('warranty') && toLocal(labelled('warranty')!),
  };

  switch (type) {
    case 'bill':
    case 'task':
    case 'job': {
      const due = upcoming.find((d) => d.label === 'due') ?? labelled('due') ?? unlabelledUpcoming;
      result.dueDate = due && toLocal(due);
      break;
    }
    case 'travel': {
      const departure = labelled('departure') ?? upcoming.find((d) => d.label !== 'purchase' && d.label !== 'arrival');
      result.startsAt = departure && toLocal(withLabelledTime(departure, text, DEPARTURE_TIME));
      break;
    }
    case 'coupon': {
      // Coupons print one date, and it is almost always the expiry.
      const expiry = labelled('expiry') ?? upcoming.find((d) => d.label !== 'purchase');
      result.expiresOn = expiry && toLocal(expiry);
      break;
    }
    case 'event': {
      // Prefer a date that came with a time; posters often repeat the date without it.
      const start = upcoming.find((d) => d.time && d.label !== 'expiry') ?? upcoming.find((d) => d.label !== 'expiry');
      result.startsAt = start && toLocal(withLabelledTime(start, text, START_TIME));
      break;
    }
  }
  return result;
}

const DEPARTURE_TIME = /^(?:departure|departs|dep|std|flight time|time)\b/i;
const START_TIME = /^(?:time|starts?|starting|from|doors(?: open)?|begins)\b/i;

/**
 * A date whose time sits in its own labelled cell ("DATE: 29SEP", "DEPARTURE: 06:20")
 * gets that time. Unlabelled times are ignored: a boarding pass also prints the
 * boarding and arrival times.
 */
function withLabelledTime(match: DateMatch, text: string, label: RegExp): DateMatch {
  if (match.time) return match;
  const time = findTimes(text).find((t) => {
    const lineStart = text.lastIndexOf('\n', t.index - 1) + 1;
    return label.test(text.slice(lineStart, t.index).trim());
  });
  return time ? { ...match, time: time.time } : match;
}

function toLocal(match: { date: string; time?: string }): LocalDateTime {
  return match.time ? `${match.date}T${match.time}` : match.date;
}

function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length ? values : undefined;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T;
}
