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
const SUFFIXED = new RegExp(`\\b${NUMBER}\\s*(\\/-|₹|\\binr\\b|\\brs\\b)`, 'gi');
const LABELLED_BARE = new RegExp(
  `(total|amount due|amount payable|payable amount|net payable|bill amount|grand total|total due|to pay)\\s*(?:\\(.{0,10}\\))?\\s*[:\\-]?\\s*${NUMBER}(?![\\d%])`,
  'gi',
);
const LABEL = /total|amount|payable|due|to pay|net|bill|price|fare|paid/;

export function findAmounts(text: string, defaultCurrency = 'INR'): AmountMatch[] {
  const matches: AmountMatch[] = [];
  const seen = new Set<number>();
  const push = (amount: number, currency: string, index: number, numberIndex: number) => {
    if (!Number.isFinite(amount) || amount <= 0 || seen.has(numberIndex)) return;
    seen.add(numberIndex);
    matches.push({ amount, currency, index, labelled: isLabelled(text, index) });
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
    push(toNumber(m[2]), defaultCurrency, numberIndex, numberIndex);
  }
  return matches.sort((a, b) => a.index - b.index);
}

/** The amount that most likely matters: a labelled one if any, else the largest. */
export function primaryAmount(matches: AmountMatch[]): AmountMatch | undefined {
  const labelled = matches.filter((m) => m.labelled);
  const pool = labelled.length ? labelled : matches;
  return pool.reduce<AmountMatch | undefined>((best, m) => (!best || m.amount > best.amount ? m : best), undefined);
}

function isLabelled(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return LABEL.test(text.slice(Math.max(lineStart, index - 30), index).toLowerCase());
}

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}
