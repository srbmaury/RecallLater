import type { SharePayload } from 'expo-sharing';

import RecallNative from '../../modules/recall-native';
import { attachmentFile, importAttachment } from '@/lib/attachments';
import type { Barcode, SourceType } from '@/lib/types';

export type Intake = {
  sourceType: SourceType;
  text: string;
  attachments: string[];
  barcodes: Barcode[];
  /** Steps that failed but didn't stop the item from being saved. */
  warnings: string[];
};

const MAX_PDF_PAGES = 5;

type Kind = 'text' | 'url' | 'image' | 'pdf' | 'file' | 'unsupported';

/**
 * Turns what the OS handed us into text + private copies of the files. Everything
 * here runs on-device: raw payloads are used (not the resolved ones) because
 * resolving a shared URL makes a network request to the site.
 */
export async function processPayloads(payloads: SharePayload[]): Promise<Intake> {
  const texts: string[] = [];
  const attachments: string[] = [];
  const barcodes: Barcode[] = [];
  const warnings: string[] = [];
  const kinds = new Set<Kind>();

  for (const payload of payloads) {
    const kind = kindOf(payload);
    kinds.add(kind);
    switch (kind) {
      case 'text':
      case 'url':
        texts.push(payload.value.trim());
        break;
      case 'image': {
        const name = await importAttachment(payload.value, payload.mimeType);
        attachments.push(name);
        const uri = attachmentFile(name).uri;
        const [ocr, codes] = await Promise.allSettled([
          RecallNative.recognizeTextAsync(uri),
          RecallNative.detectBarcodesAsync(uri),
        ]);
        if (ocr.status === 'fulfilled') texts.push(ocr.value.text);
        else warnings.push("Couldn't read text in the image.");
        if (codes.status === 'fulfilled') barcodes.push(...codes.value);
        break;
      }
      case 'pdf': {
        const name = await importAttachment(payload.value, 'application/pdf');
        attachments.push(name);
        try {
          const pdf = await RecallNative.extractPdfTextAsync(attachmentFile(name).uri, MAX_PDF_PAGES);
          texts.push(pdf.text);
          if (pdf.pageCount > MAX_PDF_PAGES) warnings.push(`Read the first ${MAX_PDF_PAGES} of ${pdf.pageCount} pages.`);
        } catch {
          warnings.push("Couldn't read text in the PDF.");
        }
        break;
      }
      case 'file':
        attachments.push(await importAttachment(payload.value, payload.mimeType));
        break;
      case 'unsupported':
        warnings.push('Audio and video are not supported yet.');
        break;
    }
  }

  return {
    sourceType: sourceTypeOf(kinds),
    text: texts.filter(Boolean).join('\n\n'),
    attachments,
    barcodes: dedupe(barcodes),
    warnings,
  };
}

function kindOf(payload: SharePayload): Kind {
  const mime = payload.mimeType?.toLowerCase() ?? '';
  if (payload.shareType === 'text') return /^\s*https?:\/\/\S+\s*$/i.test(payload.value) ? 'url' : 'text';
  if (payload.shareType === 'url' && /^https?:/i.test(payload.value)) return 'url';
  if (payload.shareType === 'image' || mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/i.test(payload.value.split(/[?#]/)[0])) return 'pdf';
  if (payload.shareType === 'audio' || payload.shareType === 'video') return 'unsupported';
  return 'file';
}

function sourceTypeOf(kinds: Set<Kind>): SourceType {
  if (kinds.has('pdf')) return 'pdf';
  if (kinds.has('image')) return 'image';
  if (kinds.has('file')) return 'file';
  if (kinds.has('url') && !kinds.has('text')) return 'url';
  return 'text';
}

function dedupe(barcodes: Barcode[]): Barcode[] {
  const seen = new Set<string>();
  return barcodes.filter((b) => !seen.has(b.rawValue) && seen.add(b.rawValue));
}
