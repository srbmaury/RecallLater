import type { SharePayload } from 'expo-sharing';

/**
 * Items the user added from inside the app (photo picker, file picker, typed text),
 * handed to the share review screen in the same shape the OS share sheet uses, so
 * both paths go through identical on-device processing.
 */
let pending: SharePayload[] = [];

export function setPendingPayloads(payloads: SharePayload[]): void {
  pending = payloads;
}

export function getPendingPayloads(): SharePayload[] {
  return pending;
}

export function clearPendingPayloads(): void {
  pending = [];
}
