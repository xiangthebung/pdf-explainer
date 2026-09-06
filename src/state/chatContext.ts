import { toPlainText } from '~shared/markdown';
import type { NeighbourNote, OutlineEntry, SlideNote } from '~shared/types';

/**
 * What the tutor is told about the rest of the deck.
 *
 * The chat prompt asks the model to "reference other slides by number", and for
 * a long time it had nothing to reference: the request carried the current
 * slide's text and notes and not a word about any other slide, so "how does
 * this relate to the last slide?" was answered from thin air. Sending the whole
 * deck would fix that and cost a PDF upload per question.
 *
 * This is the middle: the headline of every explained slide, so the model knows
 * the shape of the lecture, and the notes on the slides either side of this
 * one, abridged, so the questions people actually ask — "why did we need the
 * previous step?" — have their answer in the context. Every part is bounded, so
 * a 300-slide deck costs the same handful of kilobytes as a ten-slide one.
 */

/** How many slides either side of the current one travel with a question. */
export const NEIGHBOUR_SPAN = 2;
/** Characters of notes per neighbouring slide. */
export const NEIGHBOUR_CHARS = 1200;
/** Characters per outline headline. The prompt asks for nine words. */
export const OUTLINE_TITLE_CHARS = 100;
/** Outline entries, at most. Beyond this a deck is a book. */
export const OUTLINE_LIMIT = 300;

export interface ChatContext {
  outline: OutlineEntry[];
  neighbours: NeighbourNote[];
}

function noteText(note: SlideNote, limit: number): string {
  return toPlainText(note.blocks.map((block) => block.content).join('\n\n'), limit);
}

export function buildChatContext(notes: Record<number, SlideNote>, slide: number): ChatContext {
  const explained = Object.values(notes).sort((a, b) => a.slide - b.slide);

  const outline: OutlineEntry[] = [];
  for (const note of explained) {
    const title = note.summary.trim().slice(0, OUTLINE_TITLE_CHARS);
    if (!title) continue;
    outline.push({ slide: note.slide, title });
    if (outline.length >= OUTLINE_LIMIT) break;
  }

  const neighbours: NeighbourNote[] = [];
  for (let page = slide - NEIGHBOUR_SPAN; page <= slide + NEIGHBOUR_SPAN; page += 1) {
    if (page === slide) continue;
    const note = notes[page];
    if (!note) continue;
    const text = noteText(note, NEIGHBOUR_CHARS);
    if (!text && !note.summary) continue;
    neighbours.push({ slide: page, title: note.summary.trim().slice(0, OUTLINE_TITLE_CHARS), text });
  }

  return { outline, neighbours };
}
