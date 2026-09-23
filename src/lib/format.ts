import { formatDay, formatLocalDateTime } from '@/lib/dates';
import type { ExtractedFields, Item, ItemType } from '@/lib/types';

export const TYPE_META: Record<ItemType, { label: string; collection: string; emoji: string }> = {
  bill: { label: 'Bill', collection: 'Bills', emoji: '⚡' },
  task: { label: 'Task', collection: 'Tasks', emoji: '💬' },
  event: { label: 'Event', collection: 'Events', emoji: '🎟' },
  travel: { label: 'Travel', collection: 'Trips', emoji: '✈️' },
  receipt: { label: 'Receipt', collection: 'Receipts', emoji: '🧾' },
  purchase: { label: 'Buy later', collection: 'Buy Later', emoji: '🛒' },
  generic: { label: 'Saved', collection: 'Saved', emoji: '📌' },
};

export function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** One line under the title: the facts that make this item actionable. */
export function summarize(item: Pick<Item, 'type' | 'fields' | 'extractedText'>, now = new Date()): string {
  const f = item.fields;
  const money = f.amount !== undefined ? formatMoney(f.amount, f.currency) : undefined;
  const parts: (string | undefined)[] = (() => {
    switch (item.type) {
      case 'bill':
        return [money, f.dueDate && `Due ${formatLocalDateTime(f.dueDate, now)}`];
      case 'task':
        return [f.dueDate ? `By ${formatLocalDateTime(f.dueDate, now)}` : undefined];
      case 'travel':
        return [f.startsAt && formatLocalDateTime(f.startsAt, now), f.flightNumber ?? (f.trainNumber && `Train ${f.trainNumber}`)];
      case 'event':
        return [f.startsAt && formatLocalDateTime(f.startsAt, now)];
      case 'receipt':
        return [money, f.returnBy ? `Return by ${formatLocalDateTime(f.returnBy, now)}` : undefined];
      case 'purchase':
        return [money, f.expiresOn && `Ends ${formatLocalDateTime(f.expiresOn, now)}`];
      case 'generic':
        return [f.urls?.[0] ?? snippet(item.extractedText)];
    }
  })();
  return parts.filter(Boolean).join(' · ');
}

export type FieldRow = { label: string; value: string };

/** Extracted fields as label/value rows for the review and detail screens. */
export function fieldRows(fields: ExtractedFields, type?: ItemType, now = new Date()): FieldRow[] {
  const rows: FieldRow[] = [];
  const add = (label: string, value: string | undefined) => value && rows.push({ label, value });
  add('Amount', fields.amount !== undefined ? formatMoney(fields.amount, fields.currency) : undefined);
  add('Due', fields.dueDate && formatLocalDateTime(fields.dueDate, now));
  add('When', fields.startsAt && formatLocalDateTime(fields.startsAt, now));
  add('Route', fields.from && fields.to ? `${fields.from} → ${fields.to}` : undefined);
  add('Flight', fields.flightNumber);
  add('Train', fields.trainNumber);
  add('PNR', fields.pnr);
  add(type === 'bill' ? 'Billed on' : 'Purchased', fields.purchasedOn && formatLocalDateTime(fields.purchasedOn, now));
  add('Return by', fields.returnBy && formatLocalDateTime(fields.returnBy, now));
  add('Expires', fields.expiresOn && formatLocalDateTime(fields.expiresOn, now));
  add('Order', fields.orderId);
  add('Code', fields.couponCode);
  fields.urls?.slice(0, 3).forEach((url) => add('Link', url));
  add('Phone', fields.phones?.[0]);
  add('Email', fields.emails?.[0]);
  fields.barcodes
    ?.filter((b) => !fields.urls?.includes(b.rawValue))
    .slice(0, 2)
    .forEach((b) => add(b.format === 'qr' ? 'QR' : 'Barcode', b.rawValue));
  return rows;
}

export function formatReminder(fireAt: number | Date, now = new Date()): string {
  const date = new Date(fireAt);
  return `${formatDay(date, now)}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function snippet(text: string): string | undefined {
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}
