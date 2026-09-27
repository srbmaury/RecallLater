export const ITEM_TYPES = [
  'bill',
  'task',
  'event',
  'travel',
  'receipt',
  'purchase',
  'job',
  'coupon',
  'place',
  'book',
  'watch',
  'recipe',
  'generic',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type ItemStatus = 'active' | 'done' | 'archived';
export type SourceType = 'image' | 'pdf' | 'url' | 'text' | 'file';
export type ReminderMode = 'none' | 'once' | 'until_done';

/**
 * A local calendar date, optionally with a time: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`.
 * Kept zone-less on purpose: "due 28 Sep" means 28 Sep wherever the user is.
 */
export type LocalDateTime = string;

export type Barcode = { format: string; rawValue: string };

export type Repeat = 'weekly' | 'monthly' | 'yearly';

export type JobStage = 'saved' | 'applied' | 'interview' | 'closed';
export type Ingredient = { text: string; done: boolean };

export type ExtractedFields = {
  amount?: number;
  currency?: string;
  /** Payment or task deadline. */
  dueDate?: LocalDateTime;
  /** Event start or travel departure. */
  startsAt?: LocalDateTime;
  /** Purchase / invoice date. */
  purchasedOn?: LocalDateTime;
  returnBy?: LocalDateTime;
  expiresOn?: LocalDateTime;
  /** Comes back after it's done: the next occurrence is created with its dates moved on. */
  repeat?: Repeat;
  /** Day of the month a monthly/yearly repeat returns to, so 31 Jan → 28 Feb → 31 Mar. */
  repeatDay?: number;
  from?: string;
  to?: string;
  flightNumber?: string;
  trainNumber?: string;
  pnr?: string;
  orderId?: string;
  couponCode?: string;
  urls?: string[];
  emails?: string[];
  phones?: string[];
  barcodes?: Barcode[];
  warrantyUntil?: LocalDateTime;
  // Jobs
  company?: string;
  location?: string;
  stage?: JobStage;
  // Coupons
  merchant?: string;
  discount?: string;
  // Places
  address?: string;
  placeKind?: 'eat' | 'destination';
  // Books and shows
  author?: string;
  platform?: string;
  // Recipes
  ingredients?: Ingredient[];
  // QR payloads
  wifi?: { ssid: string; password?: string; security?: string };
  contact?: { name?: string; phone?: string; email?: string };
  upi?: { payee: string; name?: string; amount?: number };
};

export type Item = {
  id: string;
  type: ItemType;
  title: string;
  status: ItemStatus;
  sourceType: SourceType;
  extractedText: string;
  fields: ExtractedFields;
  /** File names inside the app's private attachments directory. */
  attachments: string[];
  confidence: number;
  /** Epoch ms of the date that matters most for this item (due / departure / event). */
  dueAt: number | null;
  reminderMode: ReminderMode;
  nextReminderAt: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};
