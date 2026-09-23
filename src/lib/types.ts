export const ITEM_TYPES = ['bill', 'task', 'event', 'travel', 'receipt', 'purchase', 'generic'] as const;
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
