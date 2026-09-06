import { describe, expect, it } from 'vitest';
import type { ExplainBatch, SlideNote } from '../shared/types';
import { planReadAhead, readAheadBackoffMs, requestSpacingMs, READ_AHEAD_DISTANCE } from '../src/state/readAhead';
import { emptyState, studyReducer } from '../src/state/reducer';
import type { StudyState } from '../src/state/types';

/**
 * When the next batch is fetched without a click.
 *
 * The plan is a pure function of the state, and these pin down the edges of it:
 * how close the reader has to be, what blocks it, and how the rate limit is
 * respected. A timer that fires a network request is exactly the kind of thing
 * that should be tested as arithmetic before it is trusted as behaviour.
 */

const NOW = 1_800_000_000_000;

function note(slide: number): SlideNote {
  return { slide, summary: `Slide ${slide}`, blocks: [], quiz: [], matching: [], cloze: [], worked: null };
}

function batch(slides: number[]): ExplainBatch {
  return {
    requestedFrom: slides[0],
    from: slides[0],
    to: slides[slides.length - 1],
    totalSlides: 12,
    track: 'mixed',
    trackNote: '',
    notes: slides.map(note),
    warnings: [],
  };
}

function deck(explained: number[], currentSlide: number, patch: Partial<StudyState> = {}): StudyState {
  let state = studyReducer(emptyState, {
    type: 'session/open',
    id: 'session',
    source: { base64: 'JVBERi0=', name: 'Deck', bytes: 8 },
    totalSlides: 12,
    style: 'auto',
    customInstructions: '',
  });
  if (explained.length) state = studyReducer(state, { type: 'explain/success', batch: batch(explained) });
  state = studyReducer(state, { type: 'slide/goto', slide: currentSlide });
  return { ...state, ...patch };
}

const plan = (state: StudyState, extra: Partial<Parameters<typeof planReadAhead>[0]> = {}) =>
  planReadAhead({ state, needsKey: false, lastStartedAt: 0, requestsPerMinute: 5, now: NOW, ...extra });

describe('planReadAhead', () => {
  it('fetches the next batch once the reader is within reach of the frontier', () => {
    expect(READ_AHEAD_DISTANCE).toBe(2);
    // Notes cover 1-3; the frontier is slide 4.
    expect(plan(deck([1, 2, 3], 1))).toBeNull(); // three slides away: not yet
    expect(plan(deck([1, 2, 3], 2))).toEqual({ from: 4, delayMs: 0 });
    expect(plan(deck([1, 2, 3], 3))).toEqual({ from: 4, delayMs: 0 });
    // Standing on the unexplained slide itself counts too.
    expect(plan(deck([1, 2, 3], 4))).toEqual({ from: 4, delayMs: 0 });
  });

  it('chases the gap in front of the reader, never one behind them', () => {
    // A reader who explained from slide 6 onwards has a gap at 1 they did not ask for.
    expect(plan(deck([6, 7, 8], 7))).toEqual({ from: 9, delayMs: 0 });
    expect(plan(deck([6, 7, 8], 6))).toBeNull();
  });

  it('waits for the first batch: an unexplained deck is the reader’s call', () => {
    expect(plan(deck([], 1))).toBeNull();
  });

  it('stands down when paused, without a key, on the demo, or with nothing left', () => {
    const near = deck([1, 2, 3], 3);
    expect(plan({ ...near, readAhead: false })).toBeNull();
    expect(plan(near, { needsKey: true })).toBeNull();
    expect(plan({ ...near, isDemo: true })).toBeNull();
    expect(plan(deck([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 11))).toBeNull();
  });

  it('never fires two requests at once, and leaves a failure for the reader to dismiss', () => {
    const near = deck([1, 2, 3], 3);
    const running = studyReducer(near, { type: 'explain/start', from: 4, mode: 'ahead' });
    expect(plan(running)).toBeNull();

    const failed = studyReducer(running, {
      type: 'explain/failure',
      error: { message: 'Rejected', code: 'invalid_key', retryable: false },
    });
    expect(plan(failed)).toBeNull();
    expect(plan(studyReducer(failed, { type: 'explain/idle' }))).not.toBeNull();
  });

  it('spaces requests to the model’s allowance, like the review planner does', () => {
    const near = deck([1, 2, 3], 3);
    expect(requestSpacingMs(5)).toBe(12_000);
    expect(requestSpacingMs(15)).toBe(4_000);
    // The last request started two seconds ago on a five-a-minute model.
    expect(plan(near, { lastStartedAt: NOW - 2_000, requestsPerMinute: 5 })).toEqual({ from: 4, delayMs: 10_000 });
    expect(plan(near, { lastStartedAt: NOW - 2_000, requestsPerMinute: 15 })).toEqual({ from: 4, delayMs: 2_000 });
    // Long enough ago that the window has rolled over.
    expect(plan(near, { lastStartedAt: NOW - 60_000 })).toEqual({ from: 4, delayMs: 0 });
  });

  it('honours a rate-limit wait, whichever is later', () => {
    const waiting = studyReducer(deck([1, 2, 3], 3), { type: 'explain/wait', untilMs: NOW + 30_000 });
    expect(plan(waiting)).toEqual({ from: 4, delayMs: 30_000 });
    expect(plan(waiting, { lastStartedAt: NOW - 1_000, requestsPerMinute: 5 })).toEqual({ from: 4, delayMs: 30_000 });
    expect(plan(waiting, { now: NOW + 45_000 })).toEqual({ from: 4, delayMs: 0 });
  });
});

describe('readAheadBackoffMs', () => {
  it('doubles from one spacing and stops at two minutes', () => {
    expect(readAheadBackoffMs(1, 5)).toBe(12_000);
    expect(readAheadBackoffMs(2, 5)).toBe(24_000);
    expect(readAheadBackoffMs(3, 5)).toBe(48_000);
    expect(readAheadBackoffMs(4, 5)).toBe(96_000);
    expect(readAheadBackoffMs(5, 5)).toBe(120_000);
    expect(readAheadBackoffMs(9, 5)).toBe(120_000);
    // Pro is slower to begin with, so it waits longer from the first strike.
    expect(readAheadBackoffMs(1, 2)).toBe(30_000);
  });
});
