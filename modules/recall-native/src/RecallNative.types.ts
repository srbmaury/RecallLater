export type TextRecognitionResult = {
  /** Full recognized text, lines joined with `\n` in reading order. */
  text: string;
  lines: string[];
};

export type PdfTextResult = {
  text: string;
  pageCount: number;
  /** Number of pages that had no text layer and were OCR'd instead. */
  ocrPageCount: number;
};

export type BarcodeResult = {
  /** Normalized symbology name, e.g. `qr`, `ean13`, `code128`. */
  format: string;
  rawValue: string;
};
