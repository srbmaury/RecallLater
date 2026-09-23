import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

function attachmentsDir(): Directory {
  // Only the file name is stored in SQLite: the absolute container path changes on
  // iOS between app updates.
  const dir = new Directory(Paths.document, 'attachments');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function attachmentFile(name: string): File {
  return new File(attachmentsDir(), name);
}

/**
 * Copies a shared file (a `file://` or Android `content://` URI) into private storage.
 * Uses the legacy API because the new `File#copy` rejects `content://` sources.
 */
export async function importAttachment(sourceUri: string, mimeType?: string | null): Promise<string> {
  const name = `${Crypto.randomUUID()}${extensionFor(sourceUri, mimeType)}`;
  await copyAsync({ from: sourceUri, to: attachmentFile(name).uri });
  return name;
}

export function deleteAttachments(names: string[]): void {
  for (const name of names) {
    const file = attachmentFile(name);
    if (file.exists) file.delete();
  }
}

export function deleteAllAttachments(): void {
  const dir = new Directory(Paths.document, 'attachments');
  if (dir.exists) dir.delete();
}

export function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf');
}

function extensionFor(uri: string, mimeType?: string | null): string {
  if (mimeType && EXTENSIONS[mimeType]) return EXTENSIONS[mimeType];
  const match = uri.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
}
