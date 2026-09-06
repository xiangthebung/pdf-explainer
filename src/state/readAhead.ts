import { nextGapFrom } from './reducer';
import type { StudyState } from './types';

/**
 * Read-ahead: keep the notes in front of the reader.
 *
 * Notes arrive in batches of three to twelve slides, and the batch after the
 * first used to wait for a click — you reached slide 6, read "Slide 6 is not
 * explained yet", pressed the button, and waited a minute. The app knew where
 * you were and where the notes stopped the whole time.
 *
 * So once the first batch has landed, the next one is requested on its own as
 * soon as the reader is within `READ_AHEAD_DISTANCE` slides of the first
 * unexplained slide ahead of them. Everything that decides *whether* and *when*
 * is in this file, as a pure function of the state, because a timer that fires
 * a network request is the kind of thing that wants a test rather than a hope.
 *
 * Two limits it respects on purpose:
 *
 * - **Never two requests at once.** A running or failed job blocks the plan. A
 *   failure stays on screen until the reader dismisses it, and only then does
 *   read-ahead consider trying again — so a rejected key cannot become a loop.
 * - **The model's rate limit.** Requests are spaced by `modelRequestsPerMinute`
 *   the way `shared/practicePlan.ts` spaces review passes, and a 429 backs off
 *   twice as long each time it repeats.
 */

/** How close to the frontier the reader has to be before the next batch is fetched. */
export const READ_AHEAD_DISTANCE = 2;

/** The longest a rate-limited read-ahead will wait before trying again. */
const MAX_BACKOFF_MS = 120_000;

export interface ReadAheadInput {
  state: StudyState;
  /** A key is required and missing. Nothing can be fetched. */
  needsKey: boolean;
  /** When the last explain request of any kind started, or 0 for never. */
  lastStartedAt: number;
  /** The explain model's free-tier allowance, from `modelRequestsPerMinute`. */
  requestsPerMinute: number;
  now: number;
}

export interface ReadAheadPlan {
  /** Slide to explain from. */
  from: number;
  /** How long to hold off first, so the request lands inside the rate limit. */
  delayMs: number;
}

/** Minimum gap between request starts for a model with this allowance. */
export function requestSpacingMs(requestsPerMinute: number): number {
  return Math.ceil(60_000 / Math.max(1, requestsPerMinute));
}

/**
 * How long to stand down after the n-th consecutive 429 (`attempt` counts from
 * one). One spacing, then two, then four, up to two minutes: long enough for a
 * per-minute window to roll over, short enough that a reader who stopped to
 * think does not come back to a stalled deck.
 */
export function readAheadBackoffMs(attempt: number, requestsPerMinute: number): number {
  const base = requestSpacingMs(requestsPerMinute);
  return Math.min(MAX_BACKOFF_MS, base * 2 ** Math.max(0, attempt - 1));
}

export function planReadAhead(input: ReadAheadInput): ReadAheadPlan | null {
  const { state } = input;
  if (!state.source || state.isDemo || !state.readAhead || input.needsKey) return null;
  // One job at a time, and a failure is the reader's to dismiss first.
  if (state.explain.status !== 'idle') return null;
  // "After the first batch lands": an unexplained deck still waits for the
  // reader to press the button, because that is the moment they choose the
  // style and decide to spend their quota.
  if (Object.keys(state.notes).length === 0) return null;

  const from = nextGapFrom(state, state.currentSlide);
  if (from === null || from - state.currentSlide > READ_AHEAD_DISTANCE) return null;

  const spaced = input.lastStartedAt > 0 ? input.lastStartedAt + requestSpacingMs(input.requestsPerMinute) : 0;
  const earliest = Math.max(spaced, state.explain.waitUntil ?? 0);
  return { from, delayMs: Math.max(0, earliest - input.now) };
}
