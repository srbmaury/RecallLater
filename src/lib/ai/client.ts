import { toDateKey } from '@/lib/dates';

import type { AiExtraction } from './merge';
import { textForAi } from './redact';

/**
 * Where the AI proxy lives. It holds the provider key, so the app never does. In
 * development that's server/ai-proxy.mjs on the Mac (`adb reverse tcp:8787 tcp:8787`).
 */
const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? (__DEV__ ? 'http://127.0.0.1:8787' : undefined);

export const AI_SETTING = 'ai_understanding';

export type AiMode = 'off' | 'ask' | 'always';

/** Stored setting → mode. Nothing stored means "ask each time". */
export function aiModeOf(value: string | null): AiMode {
  if (value === 'always' || value === 'on') return 'always';
  if (value === 'off') return 'off';
  return 'ask';
}

export function isAiConfigured(): boolean {
  return AI_URL !== undefined;
}

/**
 * Sends the shared item's cleaned-up, redacted text (never the image) for AI
 * understanding. Throws on any failure; callers fall back to on-device results.
 */
export async function askAi(text: string, now = new Date()): Promise<AiExtraction> {
  if (!AI_URL) throw new Error('AI is not configured');
  const today = `${toDateKey(now)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`;
  const response = await fetch(`${AI_URL}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: textForAi(text), today }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status})`);
  return (await response.json()) as AiExtraction;
}
