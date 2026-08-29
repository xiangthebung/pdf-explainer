import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  [combo: string]: (event: KeyboardEvent) => void;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  );
}

/**
 * Composite widgets own their arrow keys: a tab list moves between tabs, a
 * separator resizes, a radio group moves the selection. When focus is inside
 * one, the global slide shortcuts stand down — otherwise one key press moves
 * both the tab and the slide, which is exactly as disorienting as it sounds.
 *
 * A scrollable pane needs the same standing-down for the opposite reason — the
 * only keys that scroll one are the keys that change slide, so a reader halfway
 * down a long note could not reach the rest of it. Panels mark their scroller
 * `data-scroll-region`, but it is deliberately *not* in this selector: see
 * `ownsNavigationKeys` for why a scroller claims these keys only when it is
 * itself focused.
 */
const ARROW_OWNERS =
  '[role="tablist"],[role="radiogroup"],[role="listbox"],[role="menu"],[role="menubar"],' +
  '[role="grid"],[role="tree"],[role="slider"],[role="spinbutton"],[role="separator"]';

/** Space is in here as a scrolling key, which is the other thing it is. */
const NAVIGATION_KEYS = new Set([
  ' ',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function ownsNavigationKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  /*
   * A composite widget claims these keys for everything inside it: the tab is
   * within the tab list, the option within the listbox, and the key belongs to
   * the group rather than to the element that happens to hold focus.
   *
   * A scroll region is the opposite, and the difference cost a working
   * shortcut. It is a focus stop that exists *only* so the pane can be
   * scrolled, so it claims the keys when it is itself focused and not when
   * something inside it is. Matching it with `closest` handed every arrow press
   * inside the panel to the scroller: answering a fill-in-the-blank moves focus
   * to the card that replaces the input, the card sits inside the review pane,
   * and ArrowRight then stopped changing slide. The smoke suite caught it —
   * "no unsolved blank found on slide 2" — because it walks the deck with the
   * arrow keys after answering, which is exactly what a reader does.
   */
  if (target.closest(ARROW_OWNERS)) return true;
  return target.hasAttribute('data-scroll-region');
}

/**
 * Global keyboard shortcuts.
 *
 * Keys are matched case-sensitively on `event.key`, so `?` and `/` work across
 * layouts. Typing in a field never triggers a shortcut, and combos with a
 * modifier are left to the browser unless explicitly registered with a
 * `mod+` prefix.
 */
export function useShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const combo = mod ? `mod+${event.key.toLowerCase()}` : event.key;
      // `F` and `f` are different shortcuts. Only fold case when no shift is
      // held, or Shift+F would fire the plain-F handler as well.
      const caseInsensitive = !mod && !event.shiftKey ? ref.current[event.key.toLowerCase()] : undefined;
      const handler = ref.current[combo] ?? caseInsensitive;
      if (!handler) return;
      // Escape must work even from inside a text field.
      if (isTypingTarget(event.target) && event.key !== 'Escape') return;
      if (NAVIGATION_KEYS.has(event.key) && ownsNavigationKeys(event.target)) return;
      if (event.altKey) return;
      // An open dialog owns the keyboard; only Escape gets through.
      if (event.key !== 'Escape' && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      handler(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
