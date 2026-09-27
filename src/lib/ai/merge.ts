import { analyze, type AnalyzeInput, type Analysis, keyDateOf } from '@/lib/parse';
import { isValidDate } from '@/lib/dates';
import { findDates } from '@/lib/parse/dates';
import { findAmounts, findBarePrice } from '@/lib/parse/money';
import { normalizeOcr } from '@/lib/parse/normalize';
import { suggestCalendar, suggestReminder } from '@/lib/parse/suggest';
import { type ExtractedFields, ITEM_TYPES, type ItemType } from '@/lib/types';

/** What the AI proxy returns (see server/extract.mjs). */
export type AiExtraction = {
  type: string;
  title: string;
  confidence: number;
  [field: string]: unknown;
};

const DATE_FIELDS = ['dueDate', 'startsAt', 'purchasedOn', 'returnBy', 'expiresOn', 'warrantyUntil'] as const;
const STRING_FIELDS = [
  'currency', 'from', 'to', 'flightNumber', 'trainNumber', 'pnr', 'orderId', 'couponCode', 'discount',
  'merchant', 'company', 'location', 'address', 'author', 'platform',
] as const;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/;

// Values the model might reasonably normalise (codes, currency) rather than copy.
const UNGROUNDED_OK = new Set(['currency', 'from', 'to']);
const loose = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Validated fields from an AI answer: wrong shapes are dropped, and text values must
 * appear in what was shared, so a guessed platform or company never gets saved.
 */
export function fieldsFromAi(ai: AiExtraction, sourceText?: string, now = new Date()): ExtractedFields {
  const source = sourceText === undefined ? undefined : loose(sourceText);
  const grounded = (key: string, value: string) => source === undefined || UNGROUNDED_OK.has(key) || source.includes(loose(value));
  const normalizedSource = sourceText === undefined ? '' : normalizeOcr(sourceText);
  const localAmounts = sourceText === undefined ? [] : [...findAmounts(normalizedSource), findBarePrice(normalizedSource)].filter((m) => m !== undefined);
  const localDates = sourceText === undefined ? [] : findDates(normalizedSource, now);
  const fields: ExtractedFields = {};
  const amount = ai.amount;
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0 &&
      (source === undefined || localAmounts.some((candidate) => Math.abs(candidate.amount - amount) < 0.005))) fields.amount = amount;
  for (const key of DATE_FIELDS) {
    const value = ai[key];
    if (typeof value === 'string' && LOCAL_DATE.test(value.slice(0, 16))) {
      const date = value.slice(0, value.includes('T') ? 16 : 10);
      const [year, month, day] = date.slice(0, 10).split('-').map(Number);
      const time = date.includes('T') ? date.slice(11) : undefined;
      const timeIsValid = !time || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
      // Compare against dates the deterministic parser can resolve, including relative
      // phrases and OCR'd separators. Keep an existing deterministic value otherwise.
      const groundedDate = localDates.some((match) => match.date === date.slice(0, 10) && (!time || match.time === time));
      if (isValidDate(year, month, day) && timeIsValid && (source === undefined || groundedDate)) fields[key] = date;
    }
  }
  for (const key of STRING_FIELDS) {
    const value = ai[key];
    if (typeof value === 'string' && value.trim() && grounded(key, value)) fields[key] = value.trim();
  }
  if (Array.isArray(ai.ingredients)) {
    const ingredients = ai.ingredients.filter(
      (i): i is string => typeof i === 'string' && i.trim() !== '' && grounded('ingredients', i),
    );
    if (ingredients.length) fields.ingredients = ingredients.map((text) => ({ text: text.trim(), done: false }));
  }
  if (fields.amount !== undefined) fields.currency ??= 'INR';
  return fields;
}

function aiType(ai: AiExtraction): ItemType | undefined {
  return (ITEM_TYPES as readonly string[]).includes(ai.type) ? (ai.type as ItemType) : undefined;
}

/**
 * Rules and AI together: the AI decides what the item is and what to call it (where
 * rules are weakest); the rules re-read the text as that type, and anything the AI
 * found fills in or corrects their fields. Reminders are then suggested from the result.
 */
export function mergeWithAi(input: AnalyzeInput, ai: AiExtraction): Analysis {
  const rules = analyze(input);
  const hasStructuredQr = input.barcodes?.some((barcode) => /^(?:https?:\/\/|www\.|WIFI:|BEGIN:VCARD|MECARD:|upi:\/\/pay|geo:)/i.test(barcode.rawValue));
  const proposedType = aiType(ai) ?? rules.type;
  // Keep a deterministic, specific classification when the model returns no useful type.
  const type = hasStructuredQr
    ? 'generic'
    : proposedType === 'generic' && rules.type !== 'generic' ? rules.type : proposedType;
  const typed = type === rules.type ? rules : analyze({ ...input, type });

  const fields: ExtractedFields = { ...typed.fields, ...fieldsFromAi(ai, input.text) };
  if ((typed.fields.ingredients?.length ?? 0) > (fields.ingredients?.length ?? 0)) {
    fields.ingredients = typed.fields.ingredients;
  }
  // Deterministic coupon parsing understands explicit offer wording and should retain it
  // when the model merely echoes nearby promotional boilerplate.
  if (type === 'coupon' && typed.fields.discount) fields.discount = typed.fields.discount;
  // Job stage and place kind are app concepts the AI isn't asked about.
  if (type === 'job') fields.stage ??= 'saved';
  if (type === 'coupon') delete fields.amount;

  const title = hasStructuredQr
    ? rules.title
    : type === 'watch' && typed.title
      ? typed.title
    : proposedType === 'generic' && rules.type !== 'generic'
    ? rules.title
    : ai.title?.trim() && groundedTitle(ai.title, input.text) ? ai.title.trim() : typed.title;
  const now = input.now ?? new Date();
  return {
    type,
    title,
    confidence: Math.max(typed.confidence, Math.min(0.97, ai.confidence ?? 0)),
    fields,
    keyDate: keyDateOf(fields),
    reminder: suggestReminder(type, fields, now),
    calendar: suggestCalendar(type, title, fields),
  };
}

function groundedTitle(title: string, text: string): boolean {
  // OCR commonly removes spaces from display text ("NIGHTOF IDEAS"), while the
  // model restores them ("Night of Ideas"). Compare compact text before falling
  // back to token overlap so a valid OCR-aware title isn't discarded.
  const compactTitle = loose(title);
  if (compactTitle.length >= 4 && loose(text).includes(compactTitle)) return true;
  const titleWords = title.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 1) ?? [];
  const sourceWords = new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return titleWords.length > 0 && titleWords.filter((word) => sourceWords.has(word)).length / titleWords.length >= 0.8;
}
