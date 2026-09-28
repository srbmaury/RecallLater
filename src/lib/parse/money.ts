export type AmountMatch = {
  amount: number;
  currency: string;
  index: number;
  /** Printed next to a "total / amount due / payable" style label. */
  labelled: boolean;
};

const SYMBOLS: Record<string, string> = {
  '₹': 'INR', rs: 'INR', 'rs.': 'INR', inr: 'INR',
  $: 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR', '£': 'GBP', gbp: 'GBP',
};
const NUMBER = '(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';

const PREFIXED = new RegExp(`(₹|\\brs\\.?|\\binr|\\$|\\busd|€|\\beur|£|\\bgbp)\\s*${NUMBER}(?![\\d%])`, 'gi');
// "2,840/-" is the Indian way of writing a whole-rupee amount.
// A symbol followed by digits belongs to the next number ("22 Oct 2026\t₹850"), not this one.
const SUFFIXED = new RegExp(`\\b${NUMBER}\\s*(\\/-|₹(?!\\s*\\d)|\\binr\\b(?!\\s*\\d)|\\brs\\b(?!\\.?\\s*\\d))`, 'gi');
const LABELLED_BARE = new RegExp(
  `(total|amount due|amount payable|payable amount|net payable|bill amount|grand total|total due|to pay|amount|price|order total|total amount)\\s*(?:\\(.{0,10}\\))?\\s*(?::|-|\\t)?\\s*${NUMBER}(?![\\d%,])`,
  'gi',
);
// A price with thousands separators and nothing else around it ("12,999"), for
// screenshots where OCR dropped the ₹ entirely.
const BARE_PRICE = /(?:^|\t)(\d{1,3}(?:,\d{2,3})+(?:\.\d{2})?)\s*(?:$|\t|\s+(?:MRP|₹|\d))/m;
const LABEL = /total|amount|payable|due|to pay|net|bill|price|fare|paid|\bfees?\b/;

export function findAmounts(text: string, defaultCurrency = 'INR'): AmountMatch[] {
  const matches: AmountMatch[] = [];
  const seen = new Set<number>();
  const push = (amount: number, currency: string, index: number, numberIndex: number, labelled = isLabelled(text, index)) => {
    if (!Number.isFinite(amount) || amount <= 0 || seen.has(numberIndex)) return;
    seen.add(numberIndex);
    matches.push({ amount, currency, index, labelled });
  };

  for (const m of text.matchAll(PREFIXED)) {
    push(toNumber(m[2]), SYMBOLS[m[1].toLowerCase()] ?? defaultCurrency, m.index, m.index + m[0].indexOf(m[2], m[1].length));
  }
  for (const m of text.matchAll(SUFFIXED)) {
    const symbol = m[2].toLowerCase();
    push(toNumber(m[1]), symbol === '/-' ? 'INR' : SYMBOLS[symbol] ?? defaultCurrency, m.index, m.index);
  }
  for (const m of text.matchAll(LABELLED_BARE)) {
    const numberIndex = m.index + m[0].lastIndexOf(m[2]);
    push(toNumber(m[2]), defaultCurrency, numberIndex, numberIndex, true);
  }
  return matches.sort((a, b) => a.index - b.index);
}

/** The amount that most likely matters: a labelled one if any, else the largest. */
export function primaryAmount(matches: AmountMatch[]): AmountMatch | undefined {
  const labelled = matches.filter((m) => m.labelled);
  const pool = labelled.length ? labelled : matches;
  return pool.reduce<AmountMatch | undefined>((best, m) => (!best || m.amount > best.amount ? m : best), undefined);
}

/** The most likely price when nothing is marked with a currency: the first grouped number. */
export function findBarePrice(text: string, defaultCurrency = 'INR'): AmountMatch | undefined {
  const m = text.match(BARE_PRICE);
  if (!m || m.index === undefined) return undefined;
  return { amount: toNumber(m[1]), currency: defaultCurrency, index: m.index, labelled: false };
}

function isLabelled(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  if (LABEL.test(text.slice(Math.max(lineStart, index - 30), index).toLowerCase())) return true;
  // "AMOUNT DUE" on one line, "₹3,108.00" alone (or in its own cell) on the next, or two
  // lines down when the line between carries no other price ("Amount Due / note / ₹1,467").
  const before = text.slice(lineStart, index);
  if (before.trim() === '' || before.endsWith('\t')) {
    const previousStart = text.lastIndexOf('\n', lineStart - 2) + 1;
    const previous = text.slice(previousStart, lineStart);
    if (LABEL.test(previous.toLowerCase())) return true;
    if (previousStart > 0 && !/\d{3,}/.test(previous)) {
      const earlierStart = text.lastIndexOf('\n', previousStart - 2) + 1;
      return LABEL.test(text.slice(earlierStart, previousStart).toLowerCase());
    }
  }
  return false;
}

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

// A till receipt's total, found from the receipt's own structure. Photos of receipts often
// come out of OCR with each value on the line before or after its label
// ("87.25 / SUB TOTAL: / 7.53 / Tax 1: / $94.78 / TOTAL:"), so values near a label count.
const DECIMAL = /(?<![\d.,])[$₹S]?\s?(\d{1,5}(?:,\d{3})*\.\d{2})(?!\d)/g;
const TOTAL_LINE = /\b(?:grand total|total due|balance due|amount due|receipt total|total|to-?go)\b/i;
const NOT_TOTAL = /\bsub\s?-?\s?tot|\btax\b|\btip\b|gratuity|suggest|saving|\bitems?\b|\bqty\b|cash|change|tender/i;
const SUBTOTAL_LINE = /\bsub\s?-?\s?tot/i;
const TAX_LINE = /\btax\b|\bgst\b|\bvat\b/i;

const decimalsOf = (line: string) => [...line.matchAll(DECIMAL)].map((m) => Number(m[1].replace(/,/g, '')));
/** A line that is only an amount or two: a value OCR split away from its label. */
const isBareValue = (line: string) => decimalsOf(line).length > 0 && !/[a-z]{3}/i.test(line.replace(DECIMAL, ''));

export function receiptTotal(text: string): number | undefined {
  const lines = text.split('\n');
  const near = (test: (line: string) => boolean) =>
    lines.flatMap((line, i) => {
      if (!test(line)) return [];
      const own = decimalsOf(line);
      if (own.length) return own;
      return [lines[i - 1], lines[i + 1]].filter((l) => l !== undefined && isBareValue(l)).flatMap(decimalsOf);
    });
  const totals = near((line) => TOTAL_LINE.test(line) && !NOT_TOTAL.test(line));
  if (!totals.length) return undefined;
  const subtotals = near((line) => SUBTOTAL_LINE.test(line));
  const taxes = near((line) => TAX_LINE.test(line) && !SUBTOTAL_LINE.test(line));
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.02;
  const byValue = [...new Set(totals)].sort((a, b) => b - a);

  // 1. Subtotal plus tax: the receipt says so itself.
  for (const total of byValue) {
    if (subtotals.some((s) => taxes.some((t) => close(s + t, total)) || (!taxes.length && close(s, total)))) return total;
  }
  // 2. Any two amounts on the page that add up to a total candidate, the smaller tax-sized.
  const all = lines.flatMap(decimalsOf);
  for (const total of byValue) {
    if (all.some((s, i) => all.some((t, j) => i !== j && t > 0 && t < s * 0.3 && close(s + t, total)))) return total;
  }
  // 3. The amount on the last line that says total.
  const last = [...lines].reverse().find((line) => TOTAL_LINE.test(line) && !NOT_TOTAL.test(line) && decimalsOf(line).length);
  return last ? decimalsOf(last).at(-1) : undefined;
}
