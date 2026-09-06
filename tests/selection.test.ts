// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  askAboutText,
  MAX_SELECTION_CHARS,
  MIN_SELECTION_CHARS,
  normaliseSelection,
  placeChip,
  readSelection,
  type SelectionLike,
} from '../src/workspace/selection';

/**
 * Select-to-ask, the arithmetic half.
 *
 * Whether a highlight counts as a question, and where the chip that offers to
 * ask it should sit, are both decided from what the browser reports about the
 * selection. jsdom reports very little — every rect is zero — so the browser's
 * `Selection` is stood in for by the four fields the code reads.
 */

function layer(): HTMLElement {
  document.body.innerHTML =
    '<div id="stage"><div id="text"><span id="a">gradient</span><span id="b">descent</span></div><p id="notes">outside</p></div>';
  return document.getElementById('text')!;
}

function selection(anchor: Node | null, focus: Node | null, text: string, collapsed = false): SelectionLike {
  return { rangeCount: 1, isCollapsed: collapsed, anchorNode: anchor, focusNode: focus, toString: () => text };
}

describe('readSelection', () => {
  it('reads a phrase highlighted inside the text layer, folded into one line', () => {
    const text = layer();
    const a = text.querySelector('#a')!.firstChild;
    const b = text.querySelector('#b')!.firstChild;
    expect(readSelection(selection(a, b, 'gradient\n   descent  '), text)).toBe('gradient descent');
  });

  it('ignores a selection that starts or ends outside the slide', () => {
    const text = layer();
    const inside = text.querySelector('#a')!.firstChild;
    const outside = document.getElementById('notes')!.firstChild;
    expect(readSelection(selection(inside, outside, 'gradient outside'), text)).toBeNull();
    expect(readSelection(selection(outside, inside, 'outside gradient'), text)).toBeNull();
  });

  it('ignores nothing, a caret, and a whole slide', () => {
    const text = layer();
    const a = text.querySelector('#a')!.firstChild;
    expect(readSelection(null, text)).toBeNull();
    expect(readSelection(selection(a, a, '', true), text)).toBeNull();
    expect(readSelection(selection(a, a, 'x'.repeat(MIN_SELECTION_CHARS - 1)), text)).toBeNull();
    expect(readSelection(selection(a, a, 'x'.repeat(MAX_SELECTION_CHARS + 1)), text)).toBeNull();
    expect(readSelection(selection(a, a, 'ok'), text)).toBe('ok');
    expect(readSelection(selection(a, a, 'ok'), null)).toBeNull();
  });

  it('normalises whitespace the way pdf.js emits it', () => {
    expect(normaliseSelection('  one\ntwo\t\tthree ')).toBe('one two three');
  });

  it('drops the bullet a drag from the left margin picks up', () => {
    expect(normaliseSelection('• Why optimisation matters')).toBe('Why optimisation matters');
    expect(normaliseSelection('- a dash bullet')).toBe('a dash bullet');
    // Only at the start: a dash inside the phrase is the phrase's own.
    expect(normaliseSelection('mini-batch descent')).toBe('mini-batch descent');
  });
});

describe('placeChip', () => {
  const bounds = { left: 100, top: 50, width: 800, height: 600 };
  const chip = { width: 136, height: 32 };

  it('sits centred just above the selection', () => {
    const placed = placeChip({ left: 400, top: 300, width: 120, height: 20 }, bounds, chip);
    expect(placed.above).toBe(true);
    expect(placed.x).toBe(360); // (400 - 100) + 60
    expect(placed.y).toBe(300 - 50 - 8 - 32);
  });

  it('flips below a selection at the top of the stage', () => {
    const placed = placeChip({ left: 400, top: 60, width: 120, height: 20 }, bounds, chip);
    expect(placed.above).toBe(false);
    expect(placed.y).toBe(60 - 50 + 20 + 8);
  });

  it('stays inside the stage at either edge', () => {
    const left = placeChip({ left: 100, top: 300, width: 10, height: 20 }, bounds, chip);
    expect(left.x).toBe(6 + chip.width / 2);
    const right = placeChip({ left: 890, top: 300, width: 10, height: 20 }, bounds, chip);
    expect(right.x).toBe(800 - 6 - chip.width / 2);
  });
});

describe('askAboutText', () => {
  it('reads as a sentence, with the phrase quoted', () => {
    expect(askAboutText('learning rate')).toBe('Explain this: “learning rate”');
  });
});
