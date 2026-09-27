/**
 * Scores rules, AI and rules+AI on real on-device OCR of the synthetic datasets
 * (captured with e2e/ocr-batch.sh + e2e/capture-ocr-batch.mjs; AI answers cached by
 * e2e/ai-eval.mjs) against their manifests. Held-out samples are reported separately.
 */
import type { ExtractedFields, ItemType } from '@/lib/types';

import { type AiExtraction, fieldsFromAi, mergeWithAi } from '@/lib/ai/merge';

import { analyze } from '..';

type Sample = {
  id: string;
  category: string;
  split?: string;
  file: string;
  text: string;
  barcodes: { format: string; rawValue: string }[];
  expected: Record<string, unknown>;
};

const groups: { name: string; samples: Sample[] }[] = [
  { name: '26-sample set', samples: require('./fixtures/dataset.json') },
  { name: '100-set train', samples: (require('./fixtures/dataset100.json') as Sample[]).filter((s) => s.split === 'train') },
  { name: '100-set validation', samples: (require('./fixtures/dataset100.json') as Sample[]).filter((s) => s.split === 'validation') },
  // Test split: report only; never use it to tune parser rules.
  { name: '100-set test', samples: (require('./fixtures/dataset100.json') as Sample[]).filter((s) => s.split === 'test') },
];
// Cached answers from e2e/ai-eval.mjs, keyed by sample id.
const aiAnswers: Record<string, AiExtraction> = require('./fixtures/dataset-ai.json');

type Mode = 'rules' | 'ai' | 'rules+ai';
const MODES: Mode[] = ['rules', 'ai', 'rules+ai'];

function run(mode: Mode, sample: Sample) {
  const input = { text: sample.text, barcodes: sample.barcodes, now: NOW };
  const ai = aiAnswers[sample.id];
  if (mode === 'rules' || !ai) return analyze(input);
  if (mode === 'rules+ai') return mergeWithAi(input, ai);
  return { type: ai.type as ItemType, title: ai.title, fields: fieldsFromAi(ai) };
}

const isImage = (sample: Sample) => !sample.id.endsWith('-pdf') && !sample.id.startsWith('pdf_');

// The dataset was made on 23 Sep 2026; dates are relative to that.
const NOW = new Date(2026, 8, 23, 10, 0);

const EXPECTED_TYPE: Record<string, ItemType> = {
  ecommerce_product: 'purchase',
  travel_ticket: 'travel',
  event: 'event',
  message_deadline: 'task',
  restaurant: 'place',
  address: 'place',
  travel_destination: 'place',
  job_posting: 'job',
  bill: 'bill',
  product_order: 'receipt',
  receipt: 'receipt',
  warranty: 'receipt',
  coupon: 'coupon',
  recipe: 'recipe',
  qr_code: 'generic',
  movie_show: 'watch',
  book: 'book',
};

type Check = { name: string; ok: boolean; got: unknown; want: unknown };

const norm = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9₹%]+/g, ' ').trim();
const contains = (haystack: unknown, needle: unknown) => norm(haystack).includes(norm(needle));
const dateOf = (value?: string) => value?.slice(0, 10);
const timeOf = (value?: string) => value?.slice(11, 16);

function checks(sample: Sample, type: ItemType, title: string, f: ExtractedFields): Check[] {
  const e = sample.expected as Record<string, never>;
  const out: Check[] = [];
  const add = (name: string, got: unknown, want: unknown, ok = got === want) => out.push({ name, ok, got, want });

  const amount = e.amount ?? e.total ?? (sample.category === 'event' ? undefined : e.price);
  if (amount !== undefined) add('amount', f.amount, amount);
  if (e.due_date) add('due', dateOf(f.dueDate), e.due_date);
  if (e.deadline) add('deadline', dateOf(f.dueDate), e.deadline);
  if (e.expiry) add('expiry', dateOf(f.expiresOn), e.expiry);
  if (e.return_deadline) add('returnBy', dateOf(f.returnBy), e.return_deadline);
  if (e.warranty_until) add('warrantyUntil', dateOf(f.warrantyUntil), e.warranty_until);
  if (e.warranty) add('warranty', f.warrantyUntil !== undefined, true);
  if (e.purchase_date) add('purchased', dateOf(f.purchasedOn), e.purchase_date);
  if (e.date) {
    const got = ['receipt', 'warranty'].includes(sample.category) ? dateOf(f.purchasedOn) : dateOf(f.startsAt);
    add('date', got, e.date);
  }
  if (e.time || e.departure) add('time', timeOf(f.startsAt), e.time ?? e.departure);
  if (e.from) add('from', f.from, e.from);
  if (e.to) add('to', f.to, e.to);
  if (e.pnr) add('pnr', f.pnr, e.pnr);
  if (e.flight) add('flight', f.flightNumber, e.flight);
  if (e.train) add('train', f.trainNumber, String(e.train).slice(0, 5));
  if (e.code) add('code', f.couponCode, e.code);
  if (e.discount) add('discount', norm(f.discount), norm(e.discount));
  if (sample.category === 'coupon' && e.merchant) add('merchant', f.merchant, e.merchant, contains(f.merchant, e.merchant));
  if (e.company) add('company', f.company, e.company, contains(f.company, e.company));
  if (e.author) add('author', f.author, e.author);
  if (e.platform) add('platform', f.platform, e.platform, contains(f.platform, e.platform));
  if (e.ingredients) {
    const got = f.ingredients?.map((i) => norm(i.text)) ?? [];
    const want = (e.ingredients as string[]).map(norm);
    add('ingredients', got.length, want.length, want.every((w) => got.includes(w)) && got.length === want.length);
  }
  if (e.value) add('qr', f.urls?.join(' '), e.value, f.urls?.includes(e.value) ?? false);
  if (e.task) add('title', title, e.task, norm(title) === norm(e.task));
  if (e.deadline_text) add('due', f.dueDate, e.deadline_text, f.dueDate !== undefined);
  if (e.qr_type) add('qr', Object.keys(f).join(','), e.qr_type, e.qr_type === 'wifi' ? !!f.wifi : e.qr_type === 'upi' ? !!f.upi : e.qr_type === 'vcard' || e.qr_type === 'contact' ? !!f.contact : true);
  const name = e.product ?? e.event ?? e.dish ?? e.name ?? e.place ?? e.title ?? e.role ?? e.destination;
  if (name) add('title', title, name, contains(title, name) || contains(name, title));
  if (e.address) add('address', f.address, e.address, contains(f.address, String(e.address).split(',')[0]));
  return [{ name: 'type', ok: type === EXPECTED_TYPE[sample.category], got: type, want: EXPECTED_TYPE[sample.category] }, ...out];
}

describe.each(groups.flatMap((group) => MODES.map((mode) => ({ ...group, mode }))))('$name · $mode', ({ name, samples, mode }) => {
  it('extracts what the manifest expects', () => {
    const rows = samples.map((sample) => {
      const result = run(mode, sample);
      return { sample, result, checks: checks(sample, result.type, result.title, result.fields) };
    });
    const images = rows.filter((r) => isImage(r.sample));

    const all = rows.flatMap((r) => r.checks);
    const typeChecks = all.filter((c) => c.name === 'type');
    const fieldChecks = all.filter((c) => c.name !== 'type');
    const report = [
      `── ${name} · ${mode} (${samples.length}) ──`,
      `Type accuracy: ${typeChecks.filter((c) => c.ok).length}/${typeChecks.length}`,
      `Field accuracy: ${fieldChecks.filter((c) => c.ok).length}/${fieldChecks.length}`,
      `Screenshots fully correct: ${images.filter((r) => r.checks.every((c) => c.ok)).length}/${images.length}`,
      `All samples fully correct: ${rows.filter((r) => r.checks.every((c) => c.ok)).length}/${rows.length}`,
      '',
      ...rows.map(({ sample, result, checks }) => {
        const failed = checks.filter((c) => !c.ok);
        const status = failed.length ? '✗' : '✓';
        const detail = failed.map((c) => `${c.name}: got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)}`).join('; ');
        return `${status} ${sample.id.padEnd(8)} ${result.type.padEnd(8)} "${result.title}"${detail ? `  — ${detail}` : ''}`;
      }),
    ].join('\n');
    console.log(report);

    expect(rows.length).toBeGreaterThan(0);
    // Quality gates apply to training examples only. Validation and test remain
    // diagnostic reports, and the test split must never guide parser tuning.
    if (name === '100-set train' && mode === 'rules') {
      expect(typeChecks.filter((c) => c.ok).length / typeChecks.length).toBeGreaterThanOrEqual(0.85);
      expect(fieldChecks.filter((c) => c.ok).length / fieldChecks.length).toBeGreaterThanOrEqual(0.6);
      expect(rows.filter((r) => r.checks.every((c) => c.ok)).length / rows.length).toBeGreaterThanOrEqual(0.3);
    }
    if (name === '100-set train' && mode === 'rules+ai') {
      expect(typeChecks.filter((c) => c.ok).length / typeChecks.length).toBeGreaterThanOrEqual(0.95);
      expect(fieldChecks.filter((c) => c.ok).length / fieldChecks.length).toBeGreaterThanOrEqual(0.95);
      expect(rows.filter((r) => r.checks.every((c) => c.ok)).length / rows.length).toBeGreaterThanOrEqual(0.9);
    }
  });
});
