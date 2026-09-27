// Turns the (already redacted) OCR text of one shared item into RecallLater's
// structured fields with an OpenAI model. Used by the proxy and the offline eval.
// Text only: images never reach this code.

const TYPES = ['bill', 'task', 'event', 'travel', 'receipt', 'purchase', 'job', 'coupon', 'place', 'book', 'watch', 'recipe', 'generic'];

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const string = nullable({ type: 'string' });
const number = nullable({ type: 'number' });

const FIELDS = {
  amount: [number, 'Amount to pay / price / receipt total, as a number (no currency symbol). For bills the amount due, for receipts the grand total.'],
  currency: [string, 'ISO code, e.g. INR.'],
  dueDate: [string, 'Deadline: bill due date, task deadline, job application deadline. YYYY-MM-DD or YYYY-MM-DDTHH:mm.'],
  startsAt: [string, 'Event start, travel departure, or restaurant reservation. YYYY-MM-DDTHH:mm when a time is known.'],
  purchasedOn: [string, 'Purchase / invoice / bill date. YYYY-MM-DD.'],
  returnBy: [string, 'Last day to return. YYYY-MM-DD.'],
  expiresOn: [string, 'Coupon or offer expiry. YYYY-MM-DD.'],
  warrantyUntil: [string, 'Warranty end date. If only a period is given, add it to the purchase date. YYYY-MM-DD.'],
  from: [string, 'Travel origin code or city as printed (e.g. DEL, NDLS).'],
  to: [string, 'Travel destination code or city as printed.'],
  flightNumber: [string, 'e.g. "6E 6132".'],
  trainNumber: [string, 'Five-digit train number only.'],
  pnr: [string, 'PNR / booking ID / reference.'],
  orderId: [string, 'Order or invoice ID.'],
  couponCode: [string, 'Coupon / promo code exactly as printed.'],
  discount: [string, 'The offer, e.g. "₹200 OFF", "25% OFF", "BUY 1 GET 1".'],
  merchant: [string, 'Brand, shop or biller.'],
  company: [string, 'Hiring company (jobs only).'],
  location: [string, 'Job location.'],
  address: [string, 'Street address of a place.'],
  author: [string, 'Book author.'],
  platform: [string, 'Streaming platform or "In cinemas".'],
  ingredients: [nullable({ type: 'array', items: { type: 'string' } }), 'Recipe ingredients, one per item, as printed (with quantities).'],
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'confidence', ...Object.keys(FIELDS)],
  properties: {
    type: { type: 'string', enum: TYPES },
    title: {
      type: 'string',
      description:
        'Short, human title for the item: product name, event name, dish, place name, job role, "DEL → BLR" for trips, a to-do for tasks ("Send final deck"), "<Biller> bill" for bills.',
    },
    confidence: { type: 'number', description: '0–1, how sure you are of the type and key fields.' },
    ...Object.fromEntries(Object.entries(FIELDS).map(([key, [schema, description]]) => [key, { ...schema, description }])),
  },
};

const INSTRUCTIONS = `You extract structured data from text that a user shared into RecallLater, a reminder app.
The text usually comes from on-device OCR of a phone screenshot, photo or PDF, so expect OCR noise:
₹ read as "T", "F", "7" or dropped; "l"/"I" for 1; "O"/"0" swaps; app chrome like status bars and buttons.

Types:
- bill: something to pay by a due date (utility, card, rent, insurance).
- task: a message asking the user to do something (WhatsApp/SMS/email ask, to-do).
- event: concert, meetup, talk, show, appointment with a date.
- travel: flight/train/bus ticket or itinerary.
- receipt: something already bought: order confirmation, invoice, receipt, warranty card.
- purchase: a product page the user might buy later.
- job: job posting.
- coupon: promo code / voucher / offer.
- place: restaurant, cafe, shop, venue, shared location, travel destination idea, table reservation.
- book: includes a bare book cover (a title plus an author's name, maybe an ISBN), even without "by".
- watch (movie/series), recipe.
- Travel reels and "places to visit" posts are place, not event, unless they give a date and time to attend.
- generic: anything else.

Rules:
- Only use facts present in the text; use null when a field is absent. Never invent codes, IDs, amounts,
  platforms or companies, and never use button labels ("ADD TO WATCHLIST", "BUY NOW") as values.
- Resolve relative dates ("Friday", "tomorrow") against TODAY. Dates without a year are the next occurrence.
- Fix obvious OCR noise in values (e.g. "73,999" where the ₹ was misread → 3999) only when the text makes it clear.
- The title must not be an app name, a status bar, a button label or a generic header like "Order confirmed".`;

/**
 * @param {{ text: string, today: string, apiKey: string, model: string, signal?: AbortSignal }} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function extract({ text, today, apiKey, model, signal }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      // Don't save the exchange as a stored completion. (OpenAI may still retain API
      // data for a limited time for abuse monitoring under its data policy.)
      store: false,
      response_format: { type: 'json_schema', json_schema: { name: 'recalllater_item', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: INSTRUCTIONS },
        { role: 'user', content: `TODAY: ${today}\n\nSHARED TEXT:\n${text.slice(0, 6000)}` },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return JSON.parse(content);
}

/** Minimal reader for .env.local then .env (both git-ignored), so no dependencies are needed. */
export async function loadEnv() {
  const { readFile } = await import('node:fs/promises');
  for (const name of ['../.env.local', '../.env']) {
    try {
      for (const line of (await readFile(new URL(name, import.meta.url), 'utf8')).split('\n')) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      // Missing file: fall through to the next one / the real environment.
    }
  }
}
