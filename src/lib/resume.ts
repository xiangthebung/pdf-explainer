import type { SessionSummary } from '../state/types';

/**
 * Which session to reopen when the app loads.
 *
 * Sessions were always saved, and the upload screen always offered them — but
 * only the ones with notes, and only after the reader had scrolled past the
 * hero to find the list. Upload a deck, read to slide 12, reload: landing page,
 * as though nothing had happened. The work was in IndexedDB the whole time.
 *
 * Now the most recent session opens on its own, at the slide it was on, and the
 * address bar names it: `?session=<id>` reopens that one rather than the newest,
 * so a tab restored by the browser goes back to the deck it was showing.
 */

export const SESSION_PARAM = 'session';

/** The session named in a query string, or null. */
export function sessionFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(SESSION_PARAM)?.trim();
  return value || null;
}

/**
 * The session to reopen: the one the URL asks for if it still exists, else the
 * most recently touched. `list` arrives newest first from `sessionStore.list`.
 */
export function pickSessionToResume(list: SessionSummary[], requested: string | null): SessionSummary | null {
  if (list.length === 0) return null;
  if (requested) {
    const match = list.find((entry) => entry.id === requested);
    if (match) return match;
  }
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

/** A query string with the session set, or with it removed when `id` is null. */
export function withSessionParam(search: string, id: string | null): string {
  const params = new URLSearchParams(search);
  if (id) params.set(SESSION_PARAM, id);
  else params.delete(SESSION_PARAM);
  const next = params.toString();
  return next ? `?${next}` : '';
}
