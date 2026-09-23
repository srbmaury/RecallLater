import { addDays, parseLocalDateTime, startOfDay, toDateKey } from '@/lib/dates';
import type { Barcode, ExtractedFields, ItemType, LocalDateTime } from '@/lib/types';

import { classify } from './classify';
import { type DateLabel, type DateMatch, findDates } from './dates';
import { findEntities } from './entities';
import { findAmounts, primaryAmount } from './money';
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
  const normalized = text.replace(/\r\n?/g, '\n');
  const dates = findDates(normalized, now);
  const amounts = findAmounts(normalized);
  const entities = findEntities(normalized);
  const barcodeUrls = barcodes.map((b) => b.rawValue).filter((v) => /^https?:\/\//i.test(v));

  const classification = forcedType
    ? { type: forcedType, confidence: 1 }
    : classify({ text: normalized, dates, amounts, entities: { ...entities, urls: [...entities.urls, ...barcodeUrls] } });
  const { type } = classification;

  const amount = primaryAmount(amounts);
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
    urls: nonEmpty([...new Set([...entities.urls, ...barcodeUrls])]),
    emails: nonEmpty(entities.emails),
    phones: nonEmpty(entities.phones),
    barcodes: nonEmpty(barcodes),
    ...pickDates(type, dates, now, entities.returnWindowDays),
  });

  const title = buildTitle(type, normalized, fields);
  const keyDate = fields.dueDate ?? fields.startsAt ?? fields.returnBy ?? fields.expiresOn;
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

function pickDates(type: ItemType, dates: DateMatch[], now: Date, returnWindowDays?: number): Partial<ExtractedFields> {
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
  };

  switch (type) {
    case 'bill':
    case 'task': {
      const due = upcoming.find((d) => d.label === 'due') ?? labelled('due') ?? unlabelledUpcoming;
      result.dueDate = due && toLocal(due);
      break;
    }
    case 'travel': {
      const departure = labelled('departure') ?? upcoming.find((d) => d.label !== 'purchase' && d.label !== 'arrival');
      result.startsAt = departure && toLocal(departure);
      break;
    }
    case 'event': {
      // Prefer a date that came with a time; posters often repeat the date without it.
      const start = upcoming.find((d) => d.time && d.label !== 'expiry') ?? upcoming.find((d) => d.label !== 'expiry');
      result.startsAt = start && toLocal(start);
      break;
    }
  }
  return result;
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
