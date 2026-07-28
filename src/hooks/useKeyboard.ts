import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  [combo: string]: (event: KeyboardEvent) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
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
 */
const ARROW_OWNERS =
  '[role="tablist"],[role="radiogroup"],[role="listbox"],[role="menu"],[role="menubar"],' +
  '[role="grid"],[role="tree"],[role="slider"],[role="spinbutton"],[role="separator"]';

const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

function ownsNavigationKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(ARROW_OWNERS));
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
