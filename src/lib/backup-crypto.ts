import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';

import RecallNative from '../../modules/recall-native';

/**
 * Passphrase protection for backup files: AES-256-GCM with a key stretched from the
 * passphrase by PBKDF2-SHA256. GCM's tag means a wrong passphrase fails loudly instead
 * of producing garbage.
 */
const KDF = 'pbkdf2-sha256';
// OWASP's recommendation for PBKDF2-SHA256, natively; fewer where only the slow JS fallback
// runs. The count is stored in the file, so either kind opens on any phone.
const NATIVE_ITERATIONS = 600_000;
const FALLBACK_ITERATIONS = 210_000;
const MIN_PASSPHRASE = 8;

type Envelope = { app: 'recalllater'; sealed: { kdf: typeof KDF; iterations: number; salt: string; data: string } };

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase doesn’t open this backup.');
  }
}

export function passphraseProblem(passphrase: string): string | null {
  return passphrase.length < MIN_PASSPHRASE ? `Use at least ${MIN_PASSPHRASE} characters.` : null;
}

/**
 * The same PBKDF2 natively where available (a fraction of a second) or in JS (a slow but
 * compatible fallback for older app builds and Android < 8), so any backup opens anywhere.
 */
async function derive(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (RecallNative.deriveKeyAsync) {
    try {
      return fromBase64(await RecallNative.deriveKeyAsync(passphrase, toBase64(salt), iterations));
    } catch (error) {
      console.warn('Native key derivation failed; falling back to JS', error);
    }
  }
  return pbkdf2Async(sha256, passphrase, salt, { c: iterations, dkLen: 32 });
}

async function keyFor(passphrase: string, salt: Uint8Array, iterations: number): Promise<AESEncryptionKey> {
  return AESEncryptionKey.import(await derive(passphrase, salt, iterations));
}

/** Bytes to a string of the same char codes, in chunks so large backups don't overflow the call stack. */
function bytesToChars(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}
const charsToBytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(bytesToChars(bytes));
const fromBase64 = (text: string) => charsToBytes(atob(text));
/** JSON with every non-ASCII character escaped (still valid JSON), so one char is one byte. */
const asciiJson = (json: string) => json.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Encrypts a backup's JSON text. */
export async function sealBackup(json: string, passphrase: string): Promise<string> {
  const salt = getRandomBytes(16);
  const iterations = RecallNative.deriveKeyAsync ? NATIVE_ITERATIONS : FALLBACK_ITERATIONS;
  const key = await keyFor(passphrase, salt, iterations);
  const sealed = await aesEncryptAsync(charsToBytes(asciiJson(json)), key);
  const envelope: Envelope = {
    app: 'recalllater',
    sealed: { kdf: KDF, iterations, salt: toBase64(salt), data: await sealed.combined('base64') },
  };
  return JSON.stringify(envelope);
}

/** A backup that needs a passphrase to open. */
export function isSealed(text: string): boolean {
  try {
    return Boolean((JSON.parse(text) as Partial<Envelope>).sealed);
  } catch {
    return false;
  }
}

export async function openBackup(text: string, passphrase: string): Promise<string> {
  const { sealed } = JSON.parse(text) as Envelope;
  if (sealed.kdf !== KDF) throw new Error('This backup was made by a newer version of RecallLater.');
  const key = await keyFor(passphrase, fromBase64(sealed.salt), sealed.iterations);
  try {
    return bytesToChars(await aesDecryptAsync(AESSealedData.fromCombined(fromBase64(sealed.data)), key));
  } catch {
    throw new WrongPassphraseError();
  }
}
