import { formatDay, formatLocalDateTime } from '@/lib/dates';
import { REPEAT_LABELS } from '@/lib/recurrence';
import type { ExtractedFields, Item, ItemType, JobStage } from '@/lib/types';

export const TYPE_META: Record<ItemType, { label: string; collection: string; emoji: string }> = {
  bill: { label: 'Bill', collection: 'Bills', emoji: '⚡' },
  task: { label: 'Task', collection: 'Tasks', emoji: '💬' },
  event: { label: 'Event', collection: 'Events', emoji: '🎟' },
  travel: { label: 'Travel', collection: 'Trips', emoji: '✈️' },
  receipt: { label: 'Receipt', collection: 'Receipts', emoji: '🧾' },
  purchase: { label: 'Buy later', collection: 'Buy Later', emoji: '🛒' },
  job: { label: 'Job', collection: 'Jobs', emoji: '💼' },
  coupon: { label: 'Coupon', collection: 'Coupons', emoji: '🏷' },
  place: { label: 'Place', collection: 'Places to Try', emoji: '🍜' },
  book: { label: 'Book', collection: 'Reading List', emoji: '📚' },
  watch: { label: 'Watch', collection: 'Watchlist', emoji: '🎬' },
  recipe: { label: 'Recipe', collection: 'Recipes', emoji: '🥘' },
  generic: { label: 'Saved', collection: 'Saved', emoji: '📌' },
};

export const JOB_STAGES: { value: JobStage; label: string }[] = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interview', label: 'Interview' },
  { value: 'closed', label: 'Closed' },
];

function formatMoney(amount: number, currency = 'INR'): string {
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
        return [
          money,
          f.returnBy ? `Return by ${formatLocalDateTime(f.returnBy, now)}` : undefined,
          !f.returnBy && f.warrantyUntil ? `Warranty till ${formatLocalDateTime(f.warrantyUntil, now)}` : undefined,
        ];
      case 'purchase':
        return [money, f.expiresOn && `Ends ${formatLocalDateTime(f.expiresOn, now)}`];
      case 'job':
        return [
          [f.company, f.location].filter(Boolean).join(', ') || undefined,
          f.dueDate && `Apply by ${formatLocalDateTime(f.dueDate, now)}`,
          f.stage && f.stage !== 'saved' ? JOB_STAGES.find((s) => s.value === f.stage)?.label : undefined,
        ];
      case 'coupon':
        return [f.couponCode, f.expiresOn && `Expires ${formatLocalDateTime(f.expiresOn, now)}`];
      case 'place':
        return [f.address ?? (f.placeKind === 'destination' ? 'Travel idea' : undefined)];
      case 'book':
        return [f.author && `by ${f.author}`];
      case 'watch':
        return [f.platform];
      case 'recipe':
        return [f.ingredients?.length ? `${f.ingredients.length} ingredients` : undefined];
      case 'generic':
        return [f.contact?.phone ?? f.contact?.email ?? f.upi?.payee ?? f.urls?.[0] ?? snippet(item.extractedText)];
    }
  })();
  return [...parts, f.repeat && `↻ ${REPEAT_LABELS[f.repeat].toLowerCase()}`].filter(Boolean).join(' · ');
}

type FieldRow = { label: string; value: string };

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
  add('Warranty till', fields.warrantyUntil && formatLocalDateTime(fields.warrantyUntil, now));
  add('Order', fields.orderId);
  add('Code', fields.couponCode);
  add('Offer', fields.discount);
  add('Merchant', fields.merchant);
  add('Company', fields.company);
  add('Location', fields.location);
  add('Address', fields.address);
  add('Author', fields.author);
  add('On', fields.platform);
  add('Wi-Fi', fields.wifi?.ssid);
  add('Password', fields.wifi?.password);
  add('Name', fields.contact?.name);
  add('Phone', fields.contact?.phone);
  add('Email', fields.contact?.email);
  add('Pay to', fields.upi && [fields.upi.name, fields.upi.payee].filter(Boolean).join(' · '));
  add('Amount', fields.upi?.amount !== undefined ? formatMoney(fields.upi.amount) : undefined);
  fields.urls?.slice(0, 3).forEach((url) => add('Link', url));
  add('Phone', fields.phones?.[0]);
  add('Email', fields.emails?.[0]);
  fields.barcodes
    // Payloads already shown as Wi-Fi / contact / UPI rows aren't repeated raw.
    ?.filter((b) => !fields.urls?.includes(b.rawValue) && !/^(WIFI:|BEGIN:VCARD|MECARD:|upi:)/i.test(b.rawValue))
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
