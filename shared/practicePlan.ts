import { modelRequestsPerMinute } from './models';

/**
 * How to cover a deck with review items without tripping a rate limit.
 *
 * Two shapes of run, chosen by the model's throughput:
 *
 *  - A high-limit model (Flash Lite) walks the deck in windows of about ten
 *    slides. Small asks finish reliably, items appear while the rest is still
 *    being written, and one bad window costs a few questions instead of the set.
 *
 *  - A low-limit model (Flash and heavier: five requests a minute) covers the
 *    whole deck in one bigger pass. Four requests would be most of its minute,
 *    and a 429 half way through is worse than a slightly smaller set.
 *
 * Either way requests are paced: `spacingMs` is the minimum gap between starts,
 * so a fast API cannot burn the allowance in ten seconds.
 */

export interface PracticeWindow {
  from: number;
  to: number;
  /** Items to ask for in this window. */
  target: number;
}

export interface PracticePlan {
  windows: PracticeWindow[];
  /** Minimum time between request starts, in milliseconds. */
  spacingMs: number;
  /** True when the deck is covered in a single request. */
  singlePass: boolean;
  requestsPerMinute: number;
}

/** Slides per window when the model has room for several requests. */
const WINDOW_SLIDES = 10;
/** Never fire more than this many requests, however long the deck. */
const MAX_WINDOWS = 12;
/** A single pass can still be split for a very long deck. */
const SINGLE_PASS_SLIDES = 60;
const MAX_SINGLE_PASS_REQUESTS = 3;
/** Item ceilings per request. */
const MAX_TARGET = 40;
const MIN_TARGET = 4;

function windowsOf(total: number, size: number, targetFor: (span: number) => number): PracticeWindow[] {
  const windows: PracticeWindow[] = [];
  for (let from = 1; from <= total; from += size) {
    const to = Math.min(total, from + size - 1);
    windows.push({ from, to, target: targetFor(to - from + 1) });
  }
  return windows;
}

export function planPractice(totalSlides: number, model: string | undefined | null): PracticePlan {
  const total = Math.max(1, Math.floor(totalSlides) || 1);
  const rpm = modelRequestsPerMinute(model);
  const spacingMs = Math.ceil(60_000 / Math.max(1, rpm));

  if (rpm < 10) {
    // One pass over everything, split only if the deck is enormous.
    const requests = Math.min(MAX_SINGLE_PASS_REQUESTS, Math.max(1, Math.ceil(total / SINGLE_PASS_SLIDES)));
    const size = Math.ceil(total / requests);
    // Ask for roughly one item per slide. It is the only request we get, and
    // whatever rewords the slides' own questions is dropped on arrival, so
    // asking short leaves the reader short.
    const windows = windowsOf(total, size, (span) => Math.min(MAX_TARGET, Math.max(MIN_TARGET, span)));
    return { windows, spacingMs, singlePass: windows.length === 1, requestsPerMinute: rpm };
  }

  const size = Math.max(WINDOW_SLIDES, Math.ceil(total / MAX_WINDOWS));
  // A couple more than one per slide: near-duplicates of the slide's own
  // practice get dropped on arrival, and this absorbs that.
  const windows = windowsOf(total, size, (span) => Math.min(14, Math.max(MIN_TARGET, span + 2)));
  return { windows, spacingMs, singlePass: windows.length === 1, requestsPerMinute: rpm };
}

/** Plain-language summary of what pressing the button will do. */
export function describePlan(plan: PracticePlan): string {
  const count = plan.windows.length;
  if (count === 1) return 'One pass over the whole deck.';
  return `${count} passes, about ${plan.windows[0].to - plan.windows[0].from + 1} slides each.`;
}
