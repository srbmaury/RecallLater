#!/usr/bin/env node
// Turns e2e/ocr-batch.sh output into a parser fixture for dataset.test.ts, mapping the
// dataset's manifest onto the scorer's field names. Understands both dataset formats:
// RecallLater_realistic_dataset (26 samples) and RecallLater_100_realistic (120).
//
//   node e2e/capture-ocr-batch.mjs <dataset> [e2e/out/ocr-batch.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [dataset, resultsPath = 'e2e/out/ocr-batch.json', outputPath] = process.argv.slice(2);
const name = basename(dataset);
const manifest = JSON.parse(readFileSync(join(dataset, 'metadata/manifest.json'), 'utf8'));
const results = JSON.parse(readFileSync(resultsPath, 'utf8')).filter((r) => r.file.startsWith(`${name}__`));

const CATEGORY = {
  product: 'ecommerce_product',
  ticket: 'travel_ticket',
  message: 'message_deadline',
  order: 'product_order',
  qr: 'qr_code',
  movie: 'movie_show',
  travel: 'travel_destination',
  job: 'job_posting',
};

/** "5:30 PM" → "17:30" */
function clock(value) {
  const m = String(value ?? '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  if (m[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
  if (m[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "25 Sep 2026" → "2026-09-25" */
function iso(value) {
  const m = String(value ?? '').match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!m) return undefined;
  return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function expected(category, f) {
  switch (category) {
    case 'product':
      return { product: f.product, price: f.price };
    case 'ticket':
      return {
        date: iso(f.date),
        departure: clock(f.departure_time),
        pnr: f.booking_id,
        ...(f.mode === 'train' ? { train: String(f.number) } : { flight: f.number }),
      };
    case 'event':
      return { event: f.event_name, date: iso(f.date), time: clock(f.time) };
    case 'message':
      return { deadline_text: f.deadline_text };
    case 'restaurant':
      return { name: f.restaurant };
    case 'job':
      return { company: f.company, role: f.role, deadline: iso(f.deadline) };
    case 'bill':
      return { amount: f.amount, due_date: iso(f.due_date) };
    case 'order':
      return { product: f.product, price: f.price, return_deadline: iso(f.return_deadline) };
    case 'coupon':
      return { code: f.code, expiry: iso(f.expiry), discount: f.offer };
    case 'recipe':
      return { dish: f.dish, ingredients: f.ingredients };
    case 'address':
      return { place: f.place_name, address: f.address };
    case 'qr':
      return f.qr_type === 'url' ? { value: f.payload } : { qr_type: f.qr_type };
    case 'movie':
      return { title: f.title, platform: f.platform };
    case 'book':
      return { title: f.title, author: f.author };
    case 'receipt':
      return { total: f.amount, date: iso(f.date), warranty: f.warranty_months ? `${f.warranty_months} months` : undefined };
    case 'travel':
      return { destination: f.destination };
    default:
      return f;
  }
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const samples = results.map((result) => {
  // "…__images__001_product_01.jpg" → "images/001_product_01.jpg"; 100-set PDFs carry the id ("01_RL013_event.pdf").
  const rel = result.file.slice(name.length + 2).replaceAll('__', '/');
  const pdfId = rel.match(/RL\d{3}/)?.[0];
  const entry = pdfId ? manifest.find((m) => m.id === pdfId) : manifest.find((m) => m.file === rel);
  if (!entry) throw new Error(`No manifest entry for ${rel}`);
  const common = { file: rel, text: result.text, barcodes: result.barcodes ?? [] };
  // The 26-sample set already uses the scorer's vocabulary.
  if (entry.expected_extraction) {
    return { id: entry.id, category: entry.category, ...common, expected: entry.expected_extraction };
  }
  return {
    id: pdfId ? `${entry.id}-pdf` : entry.id,
    category: CATEGORY[entry.category] ?? entry.category,
    split: entry.split,
    ...common,
    expected: clean(expected(entry.category, entry.expected_fields)),
  };
});

const target = outputPath ?? `src/lib/parse/__tests__/fixtures/${manifest.length > 50 ? 'dataset100' : 'dataset'}.json`;
writeFileSync(target, `${JSON.stringify(samples, null, 2)}\n`);
console.log(`Wrote ${samples.length} samples to ${target}`);
