import { describe, expect, it } from 'vitest';
import type { SlideNote } from '../shared/types';
import {
  buildChatContext,
  NEIGHBOUR_CHARS,
  NEIGHBOUR_SPAN,
  OUTLINE_LIMIT,
  OUTLINE_TITLE_CHARS,
} from '../src/state/chatContext';

/**
 * What the tutor is told about the rest of the deck, and how much.
 *
 * The prompt asked the model to reference other slides by number long before
 * it was shown any. These pin the shape of what it is shown now — the outline
 * of everything explained and the notes either side of the current slide — and
 * the ceilings that keep a long deck from turning a question into an upload.
 */

function note(slide: number, summary = `Headline ${slide}`, body = `Body of slide ${slide}.`): SlideNote {
  return {
    slide,
    summary,
    blocks: [
      { type: 'markdown', content: body },
      { type: 'callout', callout: 'concept', content: `Callout ${slide}` },
    ],
    quiz: [],
    matching: [],
    cloze: [],
    worked: null,
  };
}

function notesFor(slides: number[]): Record<number, SlideNote> {
  const map: Record<number, SlideNote> = {};
  for (const slide of slides) map[slide] = note(slide);
  return map;
}

describe('buildChatContext', () => {
  it('sends the slides either side, and not the slide itself', () => {
    expect(NEIGHBOUR_SPAN).toBe(2);
    const context = buildChatContext(notesFor([1, 2, 3, 4, 5, 6]), 3);
    expect(context.neighbours.map((entry) => entry.slide)).toEqual([1, 2, 4, 5]);
    const second = context.neighbours.find((entry) => entry.slide === 2)!;
    expect(second.title).toBe('Headline 2');
    // The notes as prose, callouts included, not as Markdown blocks.
    expect(second.text).toContain('Body of slide 2.');
    expect(second.text).toContain('Callout 2');
  });

  it('skips neighbours that have no notes yet', () => {
    const context = buildChatContext(notesFor([1, 2, 3]), 3);
    expect(context.neighbours.map((entry) => entry.slide)).toEqual([1, 2]);
    expect(buildChatContext({}, 3).neighbours).toEqual([]);
  });

  it('outlines every explained slide, in order, by headline', () => {
    const context = buildChatContext(notesFor([4, 1, 3]), 1);
    expect(context.outline).toEqual([
      { slide: 1, title: 'Headline 1' },
      { slide: 3, title: 'Headline 3' },
      { slide: 4, title: 'Headline 4' },
    ]);
  });

  it('leaves a slide with no headline out of the outline', () => {
    const notes = { 1: note(1), 2: note(2, '   ') };
    expect(buildChatContext(notes, 1).outline.map((entry) => entry.slide)).toEqual([1]);
  });

  it('stays bounded however long the deck or the notes', () => {
    const notes: Record<number, SlideNote> = {};
    for (let slide = 1; slide <= OUTLINE_LIMIT + 20; slide += 1) {
      notes[slide] = note(slide, 'H'.repeat(OUTLINE_TITLE_CHARS + 50), 'word '.repeat(NEIGHBOUR_CHARS));
    }
    const context = buildChatContext(notes, 10);
    expect(context.outline).toHaveLength(OUTLINE_LIMIT);
    for (const entry of context.outline) expect(entry.title.length).toBeLessThanOrEqual(OUTLINE_TITLE_CHARS);
    expect(context.neighbours).toHaveLength(NEIGHBOUR_SPAN * 2);
    for (const entry of context.neighbours) {
      expect(entry.text.length).toBeLessThanOrEqual(NEIGHBOUR_CHARS + 1);
      expect(entry.title.length).toBeLessThanOrEqual(OUTLINE_TITLE_CHARS);
    }
  });
});
