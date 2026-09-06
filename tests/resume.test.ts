import { describe, expect, it } from 'vitest';
import { pickSessionToResume, sessionFromSearch, withSessionParam } from '../src/lib/resume';
import type { SessionSummary } from '../src/state/types';

/**
 * Which session reopens on load, and how the address bar names it.
 *
 * Refreshing used to land on the upload screen every time, with the deck you
 * were reading sitting in IndexedDB behind a filter that only offered decks
 * with notes. These pin the two rules that replaced that: the URL's session if
 * it still exists, otherwise the newest — explained or not.
 */

function summary(id: string, updatedAt: number, explainedSlides = 0): SessionSummary {
  return { id, name: id, totalSlides: 10, explainedSlides, currentSlide: 3, updatedAt, isDemo: false };
}

describe('sessionFromSearch', () => {
  it('reads the session id out of the query string', () => {
    expect(sessionFromSearch('?session=abc-123')).toBe('abc-123');
    expect(sessionFromSearch('?foo=1&session=abc&bar=2')).toBe('abc');
    expect(sessionFromSearch('?session=')).toBeNull();
    expect(sessionFromSearch('')).toBeNull();
  });
});

describe('pickSessionToResume', () => {
  const newest = summary('newest', 300);
  const older = summary('older', 200, 4);
  const oldest = summary('oldest', 100, 10);

  it('prefers the session the URL asks for', () => {
    expect(pickSessionToResume([newest, older, oldest], 'oldest')).toBe(oldest);
  });

  it('falls back to the most recent, explained or not', () => {
    expect(pickSessionToResume([newest, older, oldest], null)).toBe(newest);
    expect(pickSessionToResume([newest, older, oldest], 'gone')).toBe(newest);
    // Order of the list is not trusted.
    expect(pickSessionToResume([oldest, newest, older], null)).toBe(newest);
  });

  it('has nothing to offer for an empty store', () => {
    expect(pickSessionToResume([], 'abc')).toBeNull();
  });
});

describe('withSessionParam', () => {
  it('sets, replaces and removes the parameter without touching the rest', () => {
    expect(withSessionParam('', 'abc')).toBe('?session=abc');
    expect(withSessionParam('?session=old&x=1', 'new')).toBe('?session=new&x=1');
    expect(withSessionParam('?session=old&x=1', null)).toBe('?x=1');
    expect(withSessionParam('?session=old', null)).toBe('');
  });
});
