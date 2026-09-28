/**
 * ~200 photographed US restaurant and store receipts with hand transcriptions (a third-party
 * dataset, so only kept locally: its OCR and answer key live in the git-ignored e2e/out/).
 * Regenerate with e2e/ocr-batch.sh on the images and the transcription parser used for
 * `receipts-truth.json`. Skipped when the files aren't there, e.g. in CI.
 */
import { analyze } from '..';

type Ocr = { file: string; text: string; barcodes: [] }[];
type Truth = Record<string, { total?: number; date?: string }>;

function load(): { ocr: Ocr; truth: Truth } | null {
  try {
    return { ocr: require('../../../../e2e/out/ocr-receipts.json'), truth: require('../../../../e2e/out/receipts-truth.json') };
  } catch {
    return null;
  }
}
const data = load();

(data ? describe : describe.skip)('real US receipts (rules only)', () => {
  it('reads type, total and date, and does not regress', () => {
    const { ocr, truth } = data!;
    const tally = { n: 0, type: 0, total: [0, 0], date: [0, 0], full: 0 };
    for (const o of ocr) {
      const want = truth[o.file.match(/(\d{4})-receipt/)?.[1] ?? ''];
      if (!want) continue;
      tally.n++;
      const r = analyze({ text: o.text, barcodes: o.barcodes, now: new Date(2026, 8, 28, 10) });
      let ok = r.type === 'receipt';
      if (ok) tally.type++;
      if (want.total !== undefined) {
        tally.total[1]++;
        if (r.fields.amount !== undefined && Math.abs(r.fields.amount - want.total) < 0.011) tally.total[0]++;
        else ok = false;
      }
      if (want.date) {
        tally.date[1]++;
        if (JSON.stringify(r.fields).includes(want.date)) tally.date[0]++;
        else ok = false;
      }
      if (ok) tally.full++;
    }
    console.log(`real receipts · fully correct ${tally.full}/${tally.n} · type ${tally.type}/${tally.n} · total ${tally.total[0]}/${tally.total[1]} · date ${tally.date[0]}/${tally.date[1]}`);
    // 29 Sep 2026, from a first run of 17 fully correct, 33 typed, 108 totals and 9 dates.
    expect(tally.full).toBeGreaterThanOrEqual(131);
    expect(tally.type).toBeGreaterThanOrEqual(190);
    expect(tally.total[0]).toBeGreaterThanOrEqual(124);
    expect(tally.date[0]).toBeGreaterThanOrEqual(99);
  });
});
