import { authenticateAsync, getEnrolledLevelAsync, SecurityLevel } from 'expo-local-authentication';

export const LOCK_SETTING = 'app_lock';
/** Quick trips out (the file picker, the share sheet, a copied code) don't lock the app again. */
const RELOCK_AFTER_MS = 30_000;

export function lockEnabled(value: string | null): boolean {
  return value === 'on';
}

export function shouldRelock(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= RELOCK_AFTER_MS;
}

/** The phone has a fingerprint, face or screen lock the app can ask for. */
export async function canLock(): Promise<boolean> {
  return (await getEnrolledLevelAsync()) > SecurityLevel.NONE;
}

/** Fingerprint or face, falling back to the phone's PIN, pattern or passcode. */
export async function unlock(): Promise<boolean> {
  const result = await authenticateAsync({ promptMessage: 'Unlock RecallLater', cancelLabel: 'Cancel' });
  return result.success;
}
