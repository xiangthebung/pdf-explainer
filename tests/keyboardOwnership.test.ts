// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypingTarget, ownsNavigationKeys } from '../src/hooks/useKeyboard';

/**
 * Who gets the arrow keys.
 *
 * The global shortcuts bind ArrowLeft/Right, Space, PageUp/Down, Home and End at
 * the window, so every focusable thing that also wants one of those keys has to
 * be able to take it. Getting the rule slightly wrong breaks a shortcut in a way
 * no type checker sees and no unit test was watching: making scroll regions
 * claim these keys for their whole subtree stopped ArrowRight changing slide
 * after answering a fill-in-the-blank, because solving the card moves focus to
 * the card, and the card is inside the review pane.
 *
 * That was caught by the browser smoke suite, several steps downstream of the
 * cause. These are the rule itself.
 */

function build(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('composite widgets own their arrow keys', () => {
  it('claims them for descendants, which is the point of a composite widget', () => {
    const list = build('<div role="tablist"><button id="tab">Notes</button></div>');
    expect(ownsNavigationKeys(list.querySelector('#tab'))).toBe(true);
  });

  it.each([
    ['tablist', '<div role="tablist"><button id="t"></button></div>'],
    ['radiogroup', '<div role="radiogroup"><button id="t"></button></div>'],
    ['listbox', '<div role="listbox"><div id="t"></div></div>'],
    ['separator', '<div role="separator" id="t"></div>'],
    ['slider', '<div role="slider" id="t"></div>'],
  ])('covers %s', (_name, html) => {
    const root = build(html);
    const target = root.id === 't' ? root : root.querySelector('#t');
    expect(ownsNavigationKeys(target)).toBe(true);
  });
});

describe('a scroll region owns them only while it is itself focused', () => {
  it('claims them when the scroller has focus, so a long note can be read', () => {
    const pane = build('<div data-scroll-region tabindex="0" id="pane"></div>');
    expect(ownsNavigationKeys(pane)).toBe(true);
  });

  /**
   * The regression, as a test. `closest('[data-scroll-region]')` returns the
   * pane for anything inside it, which is every practice card, every note and
   * every chat message — so the arrow keys stopped reaching the deck as soon as
   * focus landed on any of them.
   */
  it('does not claim them for something focused inside it', () => {
    const pane = build('<div data-scroll-region tabindex="0"><section id="card" tabindex="-1"></section></div>');
    expect(ownsNavigationKeys(pane.querySelector('#card'))).toBe(false);
  });

  it('still lets a composite widget inside a scroll region claim them', () => {
    const pane = build('<div data-scroll-region><div role="tablist"><button id="tab"></button></div></div>');
    expect(ownsNavigationKeys(pane.querySelector('#tab'))).toBe(true);
  });
});

describe('ordinary content leaves the shortcuts alone', () => {
  it('does not claim them for a plain button', () => {
    expect(ownsNavigationKeys(build('<button id="b">Explain</button>'))).toBe(false);
  });

  it('ignores a non-element target', () => {
    expect(ownsNavigationKeys(null)).toBe(false);
    expect(ownsNavigationKeys(document)).toBe(false);
  });
});

describe('typing targets never fire a shortcut', () => {
  it.each([
    ['input', '<input id="t" />'],
    ['textarea', '<textarea id="t"></textarea>'],
    ['select', '<select id="t"></select>'],
    ['role=textbox', '<div role="textbox" id="t"></div>'],
  ])('covers %s', (_name, html) => {
    expect(isTypingTarget(build(html))).toBe(true);
  });

  it('leaves a button alone', () => {
    expect(isTypingTarget(build('<button id="b"></button>'))).toBe(false);
  });
});
