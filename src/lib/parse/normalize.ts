/**
 * Repairs the mistakes on-device OCR reliably makes on phone screenshots and printed
 * documents, before any parsing. Each rule is narrow on purpose: it only fires where
 * the misread can't reasonably be anything else.
 */
export function normalizeOcr(text: string): string {
  let lines = text.split('\n');
  // The phone's status bar ("9:41   Wi-Fi 87%", or "941" with the colon lost) heads most screenshots.
  while (lines.length && isStatusBar(lines[0])) lines.shift();
  // Button labels are app chrome, not content ("ADD TO CART", "COPY CODE", "SAVE RECIPE").
  lines = lines.filter((line) => !isButtonLabel(line));

  let out = lines
    .join('\n')
    // A dotted capital I is a frequent OCR artifact in display type: THỊNGS → THINGS.
    .replace(/Ị/g, 'I')
    .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\d{1,2})/gi, '$1 ')
    // ₹ read as T, F, E, * or ? right before an amount: "T699", "F1,899.00", "*823.14".
    .replace(/(^|[\s(:])[TFE*?ZI](?=\d{1,3}(?:,\d{2,3})+(?:\.\d{2})?\b|\d{3,}(?:\.\d{2})?\b)/gm, '$1₹')
    // "l" / "I" read for 1 in quantities and list bullets: "l cup milk", "•l tbsp", "xl".
    .replace(/(^|[•·\-*]\s?|\s)[lI](?=\s+(?:cups?|tbsp|tsp|kg|g|ml|l|pinch|clove|inch|piece)\b)/gim, '$11')
    .replace(/([•·])(?=[\dlI]\s)/g, '$1 ')
    .replace(/\bx[lI]\b/g, 'x1')
    // Letter O for zero and zero for O: "O6:25" → "06:25", "0ctober" → "October".
    .replace(/\bO(?=\d[:.]\d{2}\b)/g, '0')
    .replace(/\b0(?=[a-z]{3,})/gi, 'O')
    .replace(/\bNIGHTOF\b/gi, 'NIGHT OF')
    // OCR occasionally inserts a space inside a month name.
    .replace(/\b(OCTO)\s+(BER)\b/gi, '$1$2')
    // Roman numerals in job titles: "Engineer Il" → "Engineer II".
    .replace(/\b(Il|lI|ll)\b/g, 'II');

  // On price lines, OCR can read the rupee glyph plus a 3 as "73,999".
  // This narrow shape leaves ordinary prices such as "7,249" unchanged.
  out = out.replace(/(^|\t)7(?=\d{1,3},\d{2,3}(?:\.\d{2})?[ \t]*$)/gm, '$1₹');
  return out;
}

function isStatusBar(line: string): boolean {
  const trimmed = line.trim();
  if (/^\d{3,4}$/.test(trimmed)) return true;
  return /^\d{1,2}:\d{2}\b/.test(trimmed) && (trimmed.length <= 5 || /wi-?fi|\d{1,3}\s?%|\blte\b|\b[45]g\b|volte/i.test(trimmed));
}

const BUTTON =
  /^(?:add to (?:cart|calendar|bag|wishlist)|buy now|copy code|save (?:recipe|event|place|for later)?|view (?:order|details|pass|ticket)|open in maps|apply(?: now)?|share|book now|get directions|track (?:order|package)|download|see (?:more|all))$/i;

function isButtonLabel(line: string): boolean {
  const trimmed = line.trim();
  // Buttons are short, in capitals and never carry numbers.
  return trimmed === trimmed.toUpperCase() && !/\d/.test(trimmed) && BUTTON.test(trimmed);
}
