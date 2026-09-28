import { NativeModule, requireNativeModule } from 'expo';

import type { BarcodeResult, PdfTextResult, TextRecognitionResult } from './RecallNative.types';

declare class RecallNativeModule extends NativeModule<{}> {
  /** On-device OCR of an image at a local `file://` URI. */
  recognizeTextAsync(uri: string): Promise<TextRecognitionResult>;
  /** Text of a local PDF, using its text layer and falling back to OCR per page. */
  extractPdfTextAsync(uri: string, maxPages: number): Promise<PdfTextResult>;
  /** QR codes and barcodes found in an image at a local `file://` URI. */
  detectBarcodesAsync(uri: string): Promise<BarcodeResult[]>;
  /** Keeps a local folder out of device cloud backups (iOS; Android backup is off app-wide). */
  excludeFromBackupAsync(path: string): Promise<void>;
  /** PBKDF2-HMAC-SHA256 of a UTF-8 passphrase; salt in and 32-byte key out, both base64. Missing on builds before it was added. */
  deriveKeyAsync?(passphrase: string, salt: string, iterations: number): Promise<string>;
}

export default requireNativeModule<RecallNativeModule>('RecallNative');
