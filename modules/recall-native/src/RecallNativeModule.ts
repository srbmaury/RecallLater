import { NativeModule, requireNativeModule } from 'expo';

import type { BarcodeResult, PdfTextResult, TextRecognitionResult } from './RecallNative.types';

declare class RecallNativeModule extends NativeModule<{}> {
  /** On-device OCR of an image at a local `file://` URI. */
  recognizeTextAsync(uri: string): Promise<TextRecognitionResult>;
  /** Text of a local PDF, using its text layer and falling back to OCR per page. */
  extractPdfTextAsync(uri: string, maxPages: number): Promise<PdfTextResult>;
  /** QR codes and barcodes found in an image at a local `file://` URI. */
  detectBarcodesAsync(uri: string): Promise<BarcodeResult[]>;
}

export default requireNativeModule<RecallNativeModule>('RecallNative');
