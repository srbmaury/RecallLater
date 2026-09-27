/**
 * Brings Hindi (Devanagari) text into the shapes the parser already reads: ASCII digits,
 * English month names and the English labels for due dates and amounts. Everything else,
 * such as names and titles, stays in Hindi.
 */

const MONTHS: [RegExp, string][] = [
  [/जनवरी/g, 'January'],
  // फ़ may arrive with or without its nukta dot.
  [/फ़?रवरी/g, 'February'],
  [/मार्च/g, 'March'],
  [/अप्रैल|अप्रेल/g, 'April'],
  [/जुलाई/g, 'July'],
  [/जून/g, 'June'],
  [/अगस्त/g, 'August'],
  // OCR sometimes adds a stray nasal mark: "सिंतंबर".
  [/सिं?तंबर|सितम्बर/g, 'September'],
  [/अक्टूबर|अक्तूबर/g, 'October'],
  [/नवंबर|नवम्बर/g, 'November'],
  [/दिसंबर|दिसम्बर/g, 'December'],
];

// Longest phrases first, so "कुल देय राशि" isn't read as "कुल" + "Amount Due".
const LABELS: [RegExp, string][] = [
  [/भुगतान\s+की\s+अंतिम\s+तिथि|अंतिम\s+तिथि|देय\s+तिथि|नियत\s+तिथि|भुगतान\s+तिथि/g, 'Due Date'],
  [/बिल\s+तिथि|बिल\s+दिनांक/g, 'Bill Date'],
  [/कुल\s+देय\s+राशि|कुल\s+देय|देय\s+राशि|कुल\s+राशि/g, 'Amount Due'],
  [/राशि/g, 'Amount'],
  [/दिनांक|तारीख/g, 'Date'],
];

// Hindi puts the date before the verb: "5 अक्टूबर को expire होगा" is "expires on 5 October".
const DATE = String.raw`(\d{1,2}\s+[A-Z][a-z]+(?:,?\s+\d{4})?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})`;
const DEADLINES: [RegExp, string][] = [
  [new RegExp(String.raw`${DATE}\s+को\s+(?:expire|समाप्त|ख़?त्म)\s+(?:होगा|होगी|हो\s+जाएगा|हो\s+जाएगी)`, 'g'), 'expires on $1'],
  [new RegExp(String.raw`${DATE}\s+तक\s+(?:valid|वैध|मान्य)`, 'g'), 'valid till $1'],
  [new RegExp(String.raw`${DATE}\s+तक\s+(?:भुगतान|pay|जमा)`, 'g'), 'pay by $1'],
];

// Devanagari, plus the Bengali digits the Devanagari model sometimes returns.
const DEVANAGARI = /[ऀ-ॿ০-৯]/;

export function fromDevanagari(text: string): string {
  if (!DEVANAGARI.test(text)) return text;
  let out = text
    .normalize('NFC')
    .replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966))
    // The Devanagari model sometimes returns a Bengali digit for a look-alike (৪ for ४).
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));
  // "रु. 2,840", "रू 499": the rupee written out. "श्499": the ₹ glyph misread as श्.
  out = out.replace(/(?:रु|रू)\.?\s*(?=\d)/g, '₹').replace(/(^|[\s:])श्\s*(?=\d)/gm, '$1₹');
  // OCR reads a colon after a Hindi label as a visarga: "देय तिथिः 28 सितंबर".
  out = out.replace(/ः(?=\s*(?:\d|₹))/g, ':');
  // मई (May) is also an ordinary word, so only read it next to a day or year.
  out = out.replace(/(\d{1,2}\s*)मई(?=\s*,?\s*\d{4})/g, '$1May');
  for (const [pattern, english] of [...MONTHS, ...LABELS, ...DEADLINES]) out = out.replace(pattern, english);
  // The danda ends a sentence.
  return out.replace(/\s*।/g, '.');
}
