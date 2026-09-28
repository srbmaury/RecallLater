/**
 * 46 generated screenshots and photos (RecallLater_new_images_part1), read by on-device OCR
 * on an Android emulator on 28 Sep 2026. The generator's prompt says what each image should
 * show; the images weren't verified, so values missing from the OCR text are reported, and
 * where the generator made something else (an invoice for a "product page") the answer key
 * accepts what the image actually is.
 */
import type { ExtractedFields, ItemType } from '@/lib/types';

import { analyze, keyDateOf } from '..';

type Sample = { id: string; category: string; prompt: string; text: string; barcodes: { format: string; rawValue: string }[] };
const samples: Sample[] = require('./fixtures/dataset-new46.json');

// Prompts are dated relative to the day the set was made.
const NOW = new Date(2026, 8, 28, 10, 0);

const TYPE: Record<string, ItemType> = {
  product: 'purchase', receipt: 'receipt', event: 'event', message: 'task', restaurant: 'place', job: 'job',
  bill: 'bill', order: 'receipt', coupon: 'coupon', recipe: 'recipe', address: 'place', qr: 'generic',
  movie: 'watch', book: 'book', travel: 'travel', ticket: 'travel',
};
// What each image actually is, where the category alone is ambiguous or the generator drifted.
const ACCEPT: Record<string, ItemType[]> = {
  RL112: ['event', 'generic'], RL144: ['event', 'generic'], // event entry passes
  RL113: ['event', 'watch'], RL129: ['event', 'watch'], // cinema tickets
  RL127: ['place', 'event'], // event venue directions
  RL111: ['place', 'task'], // delivery address with a visit time
  RL114: ['book', 'purchase', 'receipt'], RL130: ['book', 'task'], // book invoice, library reminder
  RL106: ['job', 'event'], RL138: ['job', 'event'], // interview invitations
  RL122: ['job', 'task'], // scholarship application deadline
  RL117: ['receipt', 'purchase'], RL133: ['receipt', 'purchase'], RL149: ['receipt', 'purchase'], // made as receipts
};
// A title a person would give each item, judged from what the image shows; any listed
// alternative counts. Items without a clear name (a chat, a handwritten note) aren't keyed.
const TITLES: Record<string, string[]> = {
  RL101: ['Compact Travel Umbrella', 'Monsoon Mart'], RL102: ['Cedar Café'], RL103: ['Maple Studio', 'Pottery'],
  RL105: ['Saffron Table'], RL106: ['Backend Engineer'], RL107: ['Electricity Bill', 'Northview Power'],
  RL108: ['Cotton bedsheet set', 'Cotton Bedsheet'], RL109: ['Save19'], RL110: ['Lemon Herb Pasta'],
  RL113: ['The Lost Horizon', 'cinevista'], RL114: ['A Brighter Tomorrow', 'Riverbend Books'], RL115: ['Freshkart'],
  RL116: ['RailMitra'], RL117: ['GreenHabitat', 'Linen Tote Bag'], RL118: ['Suryanagar Travels', 'Pune → Nashik'],
  RL119: ['MittiManch'], RL120: ['Upload documents'], RL121: ['Bean & Basil'], RL122: ['Suryadeep Education Trust', 'Scholarship'],
  RL123: ['Internet Bill'], RL124: ["Men's Casual Shirt", 'ShopVerse'], RL126: ['Annapurna Kitchen'],
  RL127: ['Autumn Fellowship'], RL128: ['BeanNest Café'], RL129: ['Raaste Phir Milenge', 'CineVerse'],
  RL130: ['The Silent Valley', 'Return'], RL131: ['Swasthya Plus Pharmacy'], RL132: ['WanderNest'],
  RL133: ['Riverside Home Decor', 'Ceramic Mug'], RL134: ['BOM → BLR'], RL135: ['Rivermist Cultural Association', 'Suron Ka Sangam'],
  RL137: ['Spice Willow'], RL138: ['Interview', 'BrightPath'], RL139: ['Water Bill'], RL142: ['SweetNest'],
  RL143: ['Sunrise Home Needs'], RL144: ['Riverfront Cultural Fest'], RL148: ['Hotel Booking'],
  RL149: ['StrideHub', "Men's Running Shoes"],
};
// A good title is one of these, without extra junk: at most a few words beyond it.
const goodTitle = (title: string, options: string[]) =>
  options.some((option) => {
    const [t, o] = [title.toLowerCase(), option.toLowerCase()];
    return t.includes(o) && t.length <= o.length + 14 && !/[:\t]|\b\d{1,2} [a-z]{3} \d{4}\b/i.test(title);
  });

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AMOUNT_TYPES = new Set(['product', 'receipt', 'event', 'bill', 'order', 'movie', 'book', 'ticket']);
const DATE_TYPES = new Set(['product', 'event', 'message', 'restaurant', 'job', 'bill', 'order', 'coupon', 'movie', 'ticket', 'receipt', 'address', 'qr']);

const digits = (value: string) => value.replace(/[^\d]/g, '');
const contains = (fields: ExtractedFields, value: string) => JSON.stringify(fields).toLowerCase().includes(value.toLowerCase());

function score() {
  const tally = { full: 0, type: 0, amount: [0, 0], date: [0, 0], title: [0, 0] };
  const rows: string[] = [];
  for (const sample of samples) {
    const result = analyze({ text: sample.text, barcodes: sample.barcodes, now: NOW });
    const misses: string[] = [];
    const accepted = ACCEPT[sample.id] ?? [TYPE[sample.category]];
    if (accepted.includes(result.type)) tally.type++;
    else misses.push(`type ${result.type}≠${accepted.join('|')}`);

    const amount = sample.prompt.replace(/minimum spend ₹[\d,]+/gi, '').match(/₹\s?([\d,]+)/)?.[1];
    if (amount && AMOUNT_TYPES.has(sample.category)) {
      tally.amount[1]++;
      if (result.fields.amount === Number(digits(amount))) tally.amount[0]++;
      else misses.push(`amount ${result.fields.amount}≠${digits(amount)}`);
    }
    const date = sample.prompt.match(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})/);
    if (date && DATE_TYPES.has(sample.category)) {
      tally.date[1]++;
      const iso = `${date[3]}-${String(MONTHS.indexOf(date[2].toLowerCase()) + 1).padStart(2, '0')}-${date[1].padStart(2, '0')}`;
      if (contains(result.fields, iso)) tally.date[0]++;
      else misses.push(`date ${keyDateOf(result.fields) ?? '-'}≠${iso}`);
    }
    const titles = TITLES[sample.id];
    if (titles) {
      tally.title[1]++;
      if (goodTitle(result.title, titles)) tally.title[0]++;
      else misses.push(`title "${result.title}"`);
    }
    if (!misses.length) tally.full++;
    rows.push(`${misses.length ? '✗' : '✓'} ${sample.id} ${sample.category.padEnd(10)} ${result.type.padEnd(8)} "${result.title.slice(0, 36)}"${misses.length ? `  — ${misses.join('; ')}` : ''}`);
  }
  return { tally, rows };
}

describe('46 new generated images (rules only)', () => {
  const { tally, rows } = score();

  it('reports accuracy', () => {
    console.log(
      `new images · fully correct ${tally.full}/${samples.length} · type ${tally.type}/${samples.length} · ` +
        `amount ${tally.amount[0]}/${tally.amount[1]} · date ${tally.date[0]}/${tally.date[1]} · title ${tally.title[0]}/${tally.title[1]}\n${rows.join('\n')}`,
    );
  });

  // Floors at the level reached on 28 Sep 2026 (the parser started at 10/46): a drop is a regression.
  it('does not regress', () => {
    expect(tally.full).toBeGreaterThanOrEqual(34);
    expect(tally.title[0]).toBeGreaterThanOrEqual(36);
    expect(tally.type).toBeGreaterThanOrEqual(43);
    expect(tally.amount[0]).toBeGreaterThanOrEqual(19);
    expect(tally.date[0]).toBeGreaterThanOrEqual(29);
  });
});
