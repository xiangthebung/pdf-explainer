import { describe, expect, it } from 'vitest';
import type { ExplainBatch, SlideNote } from '../shared/types';
import {
  deckProgress,
  emptyState,
  idleExplain,
  nextGapFrom,
  slideProgress,
  studyReducer,
  toSnapshot,
} from '../src/state/reducer';
import type { StudyState } from '../src/state/types';

function note(slide: number, overrides: Partial<SlideNote> = {}): SlideNote {
  return {
    slide,
    summary: `Slide ${slide}`,
    blocks: [{ type: 'markdown', content: `Body ${slide}` }],
    quiz: [],
    matching: [],
    cloze: [],
    worked: null,
    ...overrides,
  };
}

function batch(notes: SlideNote[], overrides: Partial<ExplainBatch> = {}): ExplainBatch {
  return {
    requestedFrom: notes[0]?.slide ?? 1,
    from: notes[0]?.slide ?? 1,
    to: notes[notes.length - 1]?.slide ?? 1,
    totalSlides: 6,
    track: 'quantitative',
    trackNote: 'Maths-heavy deck',
    notes,
    warnings: [],
    ...overrides,
  };
}

function openDeck(totalSlides = 6): StudyState {
  return studyReducer(emptyState, {
    type: 'session/open',
    id: 'session-1',
    source: { base64: 'JVBERi0=', name: 'Deck', bytes: 1024 },
    totalSlides,
    style: 'auto',
    customInstructions: '',
  });
}

describe('session lifecycle', () => {
  it('opens a deck on slide one with nothing else carried over', () => {
    const state = openDeck();
    expect(state.currentSlide).toBe(1);
    expect(state.totalSlides).toBe(6);
    expect(state.notes).toEqual({});
    expect(state.explain.status).toBe('idle');
  });

  it('clamps navigation to the deck', () => {
    let state = openDeck(3);
    state = studyReducer(state, { type: 'slide/goto', slide: 99 });
    expect(state.currentSlide).toBe(3);
    state = studyReducer(state, { type: 'slide/goto', slide: -4 });
    expect(state.currentSlide).toBe(1);
    state = studyReducer(state, { type: 'slide/step' } as never);
    expect(state.currentSlide).toBe(1);
  });

  it('pulls the current slide back when the page count shrinks', () => {
    let state = openDeck(10);
    state = studyReducer(state, { type: 'slide/goto', slide: 9 });
    state = studyReducer(state, { type: 'deck/pages', totalSlides: 4 });
    expect(state.totalSlides).toBe(4);
    expect(state.currentSlide).toBe(4);
  });

  it('forgets everything on reset', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/success', batch: batch([note(1)]) });
    state = studyReducer(state, { type: 'session/reset' });
    expect(state).toEqual(emptyState);
  });
});

describe('explain flow', () => {
  it('merges batches without losing earlier slides', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/start', from: 1 });
    expect(state.explain.status).toBe('running');
    state = studyReducer(state, { type: 'explain/success', batch: batch([note(1), note(2)]) });
    state = studyReducer(state, { type: 'explain/success', batch: batch([note(3)]) });

    expect(Object.keys(state.notes)).toEqual(['1', '2', '3']);
    expect(state.explain.status).toBe('idle');
    expect(state.track).toBe('quantitative');
  });

  it('replaces a slide when it is regenerated', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/success', batch: batch([note(1, { summary: 'First try' })]) });
    state = studyReducer(state, { type: 'explain/success', batch: batch([note(1, { summary: 'Second try' })]) });
    expect(state.notes[1].summary).toBe('Second try');
  });

  it('keeps the failed batch start so retry knows where to resume', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/start', from: 4 });
    state = studyReducer(state, {
      type: 'explain/failure',
      error: { message: 'Quota exhausted', code: 'quota', retryable: true },
    });
    expect(state.explain.status).toBe('error');
    expect(state.explain.from).toBe(4);
    state = studyReducer(state, { type: 'explain/idle' });
    expect(state.explain).toEqual(idleExplain);
  });

  it('records why a batch was asked for, and the style a rewrite wants', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/start', from: 2, mode: 'single', style: 'deep' });
    expect(state.explain.mode).toBe('single');
    expect(state.explain.style).toBe('deep');
    // The session's own style is untouched by a one-slide rewrite.
    expect(state.style).toBe('auto');

    state = studyReducer(state, { type: 'explain/success', batch: batch([note(2)]) });
    expect(state.explain).toEqual(idleExplain);

    state = studyReducer(state, { type: 'explain/start', from: 3 });
    expect(state.explain.mode).toBe('batch');
    expect(state.explain.style).toBeNull();
  });
});

describe('read-ahead', () => {
  it('is on for a new deck and can be switched off and on', () => {
    let state = openDeck();
    expect(state.readAhead).toBe(true);
    state = studyReducer(state, { type: 'readahead/set', enabled: false });
    expect(state.readAhead).toBe(false);
    state = studyReducer(state, { type: 'readahead/set', enabled: true });
    expect(state.readAhead).toBe(true);
  });

  it('holds back after a rate limit without raising an error', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/start', from: 4, mode: 'ahead' });
    state = studyReducer(state, { type: 'explain/wait', untilMs: 1_700_000_000_000 });
    expect(state.explain.status).toBe('idle');
    expect(state.explain.error).toBeNull();
    expect(state.explain.waitUntil).toBe(1_700_000_000_000);

    // The next request, whoever asks for it, clears the wait.
    state = studyReducer(state, { type: 'explain/start', from: 4 });
    expect(state.explain.waitUntil).toBeNull();
  });

  it('drops a pending wait when read-ahead is paused', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/wait', untilMs: 1_700_000_000_000 });
    state = studyReducer(state, { type: 'readahead/set', enabled: false });
    expect(state.explain.waitUntil).toBeNull();
  });

  it('finds the first gap in front of the reader, not the first gap in the deck', () => {
    let state = openDeck(10);
    state = studyReducer(state, {
      type: 'explain/success',
      batch: batch([note(5), note(6), note(7)], { totalSlides: 10 }),
    });
    // Slides 1-4 are unexplained, but a reader on slide 6 is heading for 8.
    expect(nextGapFrom(state, 6)).toBe(8);
    expect(nextGapFrom(state, 1)).toBe(1);
    expect(deckProgress(state).nextGap).toBe(1);

    state = studyReducer(state, {
      type: 'explain/success',
      batch: batch([note(8), note(9), note(10)], { totalSlides: 10 }),
    });
    expect(nextGapFrom(state, 6)).toBeNull();
  });

  it('survives a save and restore, and defaults on for older snapshots', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'readahead/set', enabled: false });
    const snapshot = toSnapshot(state)!;
    expect(snapshot.readAhead).toBe(false);
    expect(studyReducer(emptyState, { type: 'session/restore', snapshot }).readAhead).toBe(false);

    const { readAhead: _dropped, ...older } = snapshot;
    expect(studyReducer(emptyState, { type: 'session/restore', snapshot: older }).readAhead).toBe(true);
  });
});

describe('practice and progress', () => {
  const quizNote = note(2, {
    quiz: [
      { id: 'q1', slide: 2, question: 'Q1', options: ['a', 'b'], correctIndex: 0, explanation: '' },
      { id: 'q2', slide: 2, question: 'Q2', options: ['a', 'b'], correctIndex: 1, explanation: '' },
    ],
    matching: [{ id: 'm1', slide: 2, title: 'Match', pairs: [{ concept: 'a', definition: 'A' }] }],
    cloze: [{ id: 'c1', slide: 2, before: 'The', answer: 'thing', after: 'works' }],
  });

  it('counts practice per slide and across the deck', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/success', batch: batch([note(1), quizNote]) });

    expect(slideProgress(state, 2)).toEqual({ explained: true, practiceTotal: 4, practiceDone: 0 });
    state = studyReducer(state, { type: 'quiz/answer', id: 'q1', index: 0 });
    state = studyReducer(state, { type: 'item/complete', id: 'c1' });
    expect(slideProgress(state, 2).practiceDone).toBe(2);

    const deck = deckProgress(state);
    expect(deck.explained).toBe(2);
    expect(deck.total).toBe(6);
    expect(deck.nextGap).toBe(3);
    expect(deck.practiceDone).toBe(2);
    expect(deck.practiceTotal).toBe(4);
  });

  it('locks a quiz answer once given', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/success', batch: batch([quizNote]) });
    state = studyReducer(state, { type: 'quiz/answer', id: 'q1', index: 1 });
    state = studyReducer(state, { type: 'quiz/answer', id: 'q1', index: 0 });
    expect(state.quizAnswers.q1).toBe(1);
  });

  it('resets only the requested slide', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'explain/success', batch: batch([quizNote]) });
    state = studyReducer(state, { type: 'quiz/answer', id: 'q1', index: 0 });
    state = studyReducer(state, { type: 'item/complete', id: 'm1' });
    state = studyReducer(state, { type: 'progress/reset', slide: 2 });
    expect(state.quizAnswers).toEqual({});
    expect(state.completed).toEqual({});
  });

  it('accumulates practice windows and collapses repeats across passes', () => {
    let state = openDeck();
    const cloze = (id: string, answer: string) => ({
      kind: 'cloze' as const,
      id,
      slide: 1,
      before: 'A',
      answer,
      after: 'C',
    });

    state = studyReducer(state, { type: 'practice/start', append: false, total: 2, from: 1, to: 10 });
    expect(state.practice.status).toBe('running');
    expect(state.practice.progress).toEqual({ done: 0, total: 2, from: 1, to: 10 });

    state = studyReducer(state, { type: 'practice/chunk', items: [cloze('p0', 'b')], done: 1 });
    expect(state.practice.items).toHaveLength(1);
    expect(state.practice.status).toBe('running');
    expect(state.practice.progress?.done).toBe(1);

    // Second window: one repeat of the same question, one new one.
    state = studyReducer(state, {
      type: 'practice/chunk',
      items: [cloze('p0', 'b'), cloze('p1', 'other')],
      done: 2,
    });
    state = studyReducer(state, { type: 'practice/done' });

    const ids = state.practice.items.map((entry) => entry.id);
    expect(state.practice.items).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.practice.status).toBe('idle');
    expect(state.practice.progress).toBeNull();
  });

  it('marks a second pass as extended and keeps earlier answers', () => {
    let state = openDeck();
    const item = { kind: 'cloze' as const, id: 'p0', slide: 1, before: 'A', answer: 'b', after: 'C' };
    state = studyReducer(state, { type: 'practice/start', append: false, total: 1, from: 1, to: 4 });
    state = studyReducer(state, { type: 'practice/chunk', items: [item], done: 1 });
    state = studyReducer(state, { type: 'practice/done' });
    state = studyReducer(state, { type: 'practice/answer', id: 'p0', value: true });

    state = studyReducer(state, { type: 'practice/start', append: true, total: 1, from: 1, to: 4 });
    expect(state.practice.extended).toBe(true);
    expect(state.practice.answers).toEqual({ p0: true });
    expect(state.practice.items).toHaveLength(1);
  });

  it('carries a partial-coverage warning that can be dismissed', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'practice/start', append: false, total: 3, from: 1, to: 10 });
    state = studyReducer(state, {
      type: 'practice/chunk',
      items: [{ kind: 'cloze', id: 'p0', slide: 1, before: 'A', answer: 'b', after: 'C' }],
      done: 3,
    });
    state = studyReducer(state, { type: 'practice/done', warning: '2 of 3 slide ranges came back empty.' });
    expect(state.practice.warning).toContain('came back empty');

    state = studyReducer(state, { type: 'practice/notice', warning: null });
    expect(state.practice.warning).toBeNull();
  });
});

describe('chat', () => {
  it('tracks pending state and marks the failed turn for retry', () => {
    let state = openDeck();
    const message = { id: 'm1', role: 'user' as const, text: 'Why?', slide: 1, createdAt: 1 };
    state = studyReducer(state, { type: 'chat/send', message });
    expect(state.chatPending).toBe(1);

    state = studyReducer(state, {
      type: 'chat/failure',
      slide: 1,
      messageId: 'm1',
      error: { message: 'offline', code: 'network', retryable: true },
    });
    expect(state.chatPending).toBeNull();
    expect(state.chat[1][0].failed).toBe(true);

    state = studyReducer(state, { type: 'chat/retry', slide: 1, messageId: 'm1' });
    expect(state.chat[1]).toHaveLength(0);
    expect(state.chatError).toBeNull();
  });

  it('keeps conversations separate per slide', () => {
    let state = openDeck();
    state = studyReducer(state, {
      type: 'chat/send',
      message: { id: 'a', role: 'user', text: 'one', slide: 1, createdAt: 1 },
    });
    state = studyReducer(state, {
      type: 'chat/reply',
      message: { id: 'b', role: 'assistant', text: 'two', slide: 1, createdAt: 2 },
    });
    state = studyReducer(state, {
      type: 'chat/send',
      message: { id: 'c', role: 'user', text: 'three', slide: 5, createdAt: 3 },
    });
    expect(state.chat[1]).toHaveLength(2);
    expect(state.chat[5]).toHaveLength(1);

    state = studyReducer(state, { type: 'chat/clear', slide: 1 });
    expect(state.chat[1]).toBeUndefined();
    expect(state.chat[5]).toHaveLength(1);
  });
});

describe('snapshots', () => {
  it('round-trips a session through save and restore', () => {
    let state = openDeck();
    state = studyReducer(state, { type: 'slide/goto', slide: 3 });
    state = studyReducer(state, { type: 'explain/success', batch: batch([note(1), note(2)]) });
    state = studyReducer(state, { type: 'quiz/answer', id: 'q1', index: 1 });
    state = studyReducer(state, {
      type: 'chat/send',
      message: { id: 'a', role: 'user', text: 'hello', slide: 2, createdAt: 10 },
    });

    const snapshot = toSnapshot(state);
    expect(snapshot).not.toBeNull();

    const restored = studyReducer(emptyState, { type: 'session/restore', snapshot: snapshot! });
    expect(restored.id).toBe(state.id);
    expect(restored.currentSlide).toBe(3);
    expect(Object.keys(restored.notes)).toEqual(['1', '2']);
    expect(restored.quizAnswers).toEqual({ q1: 1 });
    expect(restored.chat[2]).toHaveLength(1);
    expect(restored.explain.status).toBe('idle');
  });

  it('does not snapshot an empty session', () => {
    expect(toSnapshot(emptyState)).toBeNull();
  });
});
