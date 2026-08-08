import type { ModelOption } from './types';

/**
 * Choosing a model when you do not know what models exist.
 *
 * This used to be a hardcoded catalogue of five ids. That was honest but wrong:
 * a list of model names goes stale the week a new one ships, and it offered
 * people models their own API key could not call. The catalogue now comes from
 * Google, per key, which means everything here has to reason about ids it has
 * never seen — including ids that did not exist when this was written.
 *
 * Two rules follow from that, and both were learned the hard way.
 *
 * **An id is a string, not a promise about behaviour.** `generateContent`
 * support is necessary for this app and nowhere near sufficient: Gemini's
 * text-to-speech and image-generation models support it too, and will happily be
 * asked for JSON study notes. `looksTextCapable` is the guard, and it works on
 * the name because the name is all the list gives us.
 *
 * **Substring matching is not name matching.** An earlier version scored `pro`
 * with `/pro/`, so `gemini-2.5-pro-preview-tts` outranked `gemini-2.5-pro` on a
 * tiebreak and could become the default for slide notes. Ids here are split into
 * segments and matched whole.
 */

/** A job's default model is selected from the catalogue returned for its API key. */
export type ModelPurpose = 'explain' | 'chat' | 'practice';

/**
 * Empty sentinels kept for stored preference compatibility. The server chooses a
 * real value from the key-scoped catalogue instead of using a baked-in id.
 */
export const DEFAULT_EXPLAIN_MODEL = '';
export const DEFAULT_CHAT_MODEL = '';
export const DEFAULT_PRACTICE_MODEL = '';

/**
 * Model ids come from localStorage or from Google, so keep the value narrow
 * enough to pass safely to the provider. Tuned and resource names may contain
 * slashes, which are valid for the Gemini API.
 *
 * There used to be an alias table here, mapping retired ids to replacements. It
 * had to go, and not only because it named ids that no longer exist. Every id in
 * the discovered catalogue was passed through this function, so a key that
 * genuinely offered `gemini-2.5-flash` had it rewritten to `gemini-flash-latest`
 * — a model that was then not in the catalogue, and so was dropped from the
 * chain. The alias table removed working models from the list of working models.
 * Migrating a stored preference is `resolveModelSelection`'s job, and it does it
 * by checking the catalogue rather than by guessing.
 */
export function resolveModelId(requested: string | undefined | null, fallback: string): string {
  const trimmed = (requested ?? '').trim();
  if (!trimmed) return fallback;
  if (trimmed.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(trimmed)) return fallback;
  return trimmed;
}

/** `gemini-2.5-flash-lite` → `['gemini', '2.5', 'flash', 'lite']`. */
function segmentsOf(id: string): string[] {
  return id.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);
}

/**
 * Model families that answer `generateContent` but cannot do this job: they
 * return audio, images or vectors rather than the JSON these prompts ask for.
 *
 * Note what is *not* here. Vision is not excluded — every explain and practice
 * request sends a PDF, so multimodal input is the whole point. Only multimodal
 * *output* is disqualifying.
 */
const NON_TEXT_SEGMENTS = new Set([
  'tts',
  'imagen',
  'veo',
  'embedding',
  'embeddings',
  'embed',
  'aqa',
  'live',
  'realtime',
  'audio',
  'image',
  'speech',
  'dialog',
]);

/** Whole phrases that only make sense read across segment boundaries. */
const NON_TEXT_PHRASES = [/image-generation/, /text-to-speech/, /native-audio/, /-tts$/];

export function looksTextCapable(id: string): boolean {
  const value = id.toLowerCase();
  if (NON_TEXT_PHRASES.some((pattern) => pattern.test(value))) return false;
  return !segmentsOf(value).some((segment) => NON_TEXT_SEGMENTS.has(segment));
}

const COMPACT_SEGMENTS = new Set(['lite', 'mini', 'nano', 'small', '4b', '8b', '1b']);
const PREVIEW_SEGMENTS = new Set(['preview', 'exp', 'experimental', 'rc', 'beta']);

interface ModelTraits {
  /** pro > flash > unknown > gemma. Gemma takes no PDF and no response schema. */
  readonly tier: number;
  /** Smaller sibling of its family: faster, cheaper, a higher rate limit. */
  readonly compact: boolean;
  /**
   * `gemini-3.5-flash` → 3.5. A `*-latest` alias tracks the newest release of
   * its family, so it sorts as newer than any pinned number.
   */
  readonly version: number;
  readonly preview: boolean;
}

function traitsOf(id: string): ModelTraits {
  const segments = segmentsOf(resolveModelId(id, ''));
  const has = (name: string): boolean => segments.includes(name);

  const tier = has('pro') ? 3 : has('flash') ? 2 : has('gemma') ? 0 : 1;
  const version = has('latest')
    ? Number.POSITIVE_INFINITY
    : (segments.map(Number).filter((value) => Number.isFinite(value) && value > 0)[0] ?? 0);

  return {
    tier,
    compact: segments.some((segment) => COMPACT_SEGMENTS.has(segment)),
    version,
    preview: segments.some((segment) => PREVIEW_SEGMENTS.has(segment)),
  };
}

/**
 * Free-tier requests per minute. Google's model list does not carry a per-key
 * quota, so this is an estimate from the family name — deliberately low, because
 * being wrong low costs a few seconds of pacing and being wrong high costs the
 * reader a 429 in the middle of a run.
 */
const FALLBACK_RPM = 5;
const COMPACT_RPM = 15;

export function modelRequestsPerMinute(id: string | undefined | null): number {
  return traitsOf(resolveModelId(id, '')).compact ? COMPACT_RPM : FALLBACK_RPM;
}

/** How good a substitute this model is for the job, highest first. */
function rank(id: string, purpose: ModelPurpose): number[] {
  const { tier, compact, version, preview } = traitsOf(id);
  if (purpose === 'explain') {
    // Slide notes are the heavy lifting: quality over latency.
    return [tier, compact ? 0 : 1, version, preview ? 0 : 1];
  }
  // Chat wants to feel instant; practice fires several requests in a row and
  // lives or dies on the rate limit. Both want the quick end of the catalogue.
  const speed = compact ? 3 : tier === 2 ? 2 : tier === 3 ? 1 : 0;
  return [speed, version, preview ? 0 : 1];
}

function compareFor(purpose: ModelPurpose) {
  return (left: string, right: string): number => {
    const a = rank(left, purpose);
    const b = rank(right, purpose);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return b[i] - a[i];
    }
    return left.localeCompare(right);
  };
}

/** Best-first, for a picker or a fallback ladder. */
export function rankModels(ids: readonly string[], purpose: ModelPurpose): string[] {
  return [...ids].sort(compareFor(purpose));
}

/**
 * Choose a role-appropriate model without knowing any model ids in advance.
 * Returns `''` when the catalogue is empty — the caller treats that as "let the
 * server decide", which is what happens while discovery is still in flight.
 */
export function chooseDefaultModel(options: readonly ModelOption[], purpose: ModelPurpose): string {
  const usable = options.map((option) => option.id).filter((id) => id && looksTextCapable(id));
  return rankModels(usable, purpose)[0] ?? '';
}

/**
 * Keep a stored preference if this key can still call it, otherwise fall back to
 * the role default. This is what makes a retired id in someone's localStorage a
 * non-event: it is simply not in the catalogue, so it is not chosen.
 */
export function resolveModelSelection(
  requested: string | undefined | null,
  options: readonly ModelOption[],
  purpose: ModelPurpose,
): string {
  const trimmed = (requested ?? '').trim();
  if (trimmed && options.some((option) => option.id === trimmed)) return trimmed;
  return chooseDefaultModel(options, purpose);
}

/** Trying more than this wastes the reader's time on a request that is failing. */
const MAX_CHAIN = 3;

/**
 * Ordered list of models to try: what was asked for, the role default, then the
 * best remaining substitute.
 *
 * The tail used to be `...available` straight from the catalogue, which arrived
 * sorted by display name — so the ladder after a failure was whatever happened
 * to sort first alphabetically. It is ranked for the purpose now, which is the
 * only ordering that means anything here.
 */
export function buildModelChain(
  requested: string | undefined | null,
  fallback: string,
  availableModels: readonly string[] = [],
  purpose: ModelPurpose = 'explain',
): string[] {
  const available = [...new Set(availableModels.map((id) => resolveModelId(id, '')).filter(Boolean))];
  const allowed = available.length > 0 ? new Set(available) : null;

  const head = [requested, fallback]
    .map((id) => resolveModelId(id, ''))
    .filter((id) => id && (!allowed || allowed.has(id)));

  const rest = rankModels(
    available.filter((id) => !head.includes(id) && looksTextCapable(id)),
    purpose,
  );

  return [...new Set([...head, ...rest])].slice(0, MAX_CHAIN);
}
