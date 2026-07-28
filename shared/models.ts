import type { ModelOption } from './types';

/**
 * Model catalogue. Kept in one place so the picker, the server fallback chain
 * and any stored user preference agree with each other.
 *
 * `*-latest` aliases track the newest release of a variation; the pinned ids are
 * there for people who want a stable target.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gemini-flash-lite-latest', label: 'Flash Lite', note: 'Fastest, highest rate limit', requestsPerMinute: 15 },
  { id: 'gemini-flash-latest', label: 'Flash', note: 'Deeper answers, 5 requests a minute', requestsPerMinute: 5 },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Pinned stable', requestsPerMinute: 5 },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'Deepest reasoning', requestsPerMinute: 5 },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', note: 'Pinned stable, cheap', requestsPerMinute: 15 },
];

/** Long-form slide analysis: quality matters more than latency. */
export const DEFAULT_EXPLAIN_MODEL = 'gemini-flash-latest';
/** Chat: keep it snappy and cheap. */
export const DEFAULT_CHAT_MODEL = 'gemini-flash-lite-latest';
/**
 * Review sets can take several requests, so the default is the model with room
 * for them. A heavier model still works — it covers the deck in one bigger pass
 * instead (see `planPractice`).
 */
export const DEFAULT_PRACTICE_MODEL = 'gemini-flash-lite-latest';

/**
 * Free-tier requests per minute. Deliberately conservative: being wrong low
 * costs a few seconds of pacing, being wrong high costs the user a 429 in the
 * middle of a run.
 */
const FALLBACK_RPM = 5;

export function modelRequestsPerMinute(id: string | undefined | null): number {
  const resolved = resolveModelId(id, '');
  const match = MODEL_OPTIONS.find((option) => option.id === resolved);
  if (match) return match.requestsPerMinute;
  // Unknown id: infer from the family name before giving up.
  if (/lite/i.test(resolved)) return 15;
  return FALLBACK_RPM;
}

/** Retired ids that may still be sitting in someone's localStorage. */
const ALIASES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'gemini-flash-lite-latest',
  'gemini-3-flash-preview': 'gemini-flash-latest',
  'gemini-3.1-pro-preview': 'gemini-flash-latest',
  'gemma-4-31b-it': 'gemini-flash-lite-latest',
  'gemini-2.5-flash': 'gemini-flash-latest',
  'gemini-2.5-flash-lite': 'gemini-flash-lite-latest',
  'gemini-2.5-pro': 'gemini-3.5-flash',
};

export function resolveModelId(requested: string | undefined | null, fallback: string): string {
  const trimmed = (requested ?? '').trim();
  if (!trimmed) return fallback;
  if (trimmed.length > 80 || /[^a-zA-Z0-9._-]/.test(trimmed)) return fallback;
  return ALIASES[trimmed] ?? trimmed;
}

/**
 * Ordered list of models to try. The requested model comes first, then a small
 * ladder of known-good fallbacks so a retired or region-locked id does not turn
 * into a dead end for the user.
 */
export function buildModelChain(requested: string | undefined | null, fallback: string): string[] {
  const primary = resolveModelId(requested, fallback);
  const ladder = [primary, fallback, 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
  return ladder.filter((id, index) => id && ladder.indexOf(id) === index);
}
