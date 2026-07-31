import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp } from '../lib/utils';

/**
 * One width, dragged from anywhere.
 *
 * The study panel has two layouts and they shared a width but not a way to change it: the
 * split view had a divider you could drag, and the floating overlay took the same number as
 * a read-only prop. So the notes were resizable in one mode and fixed in the other, with no
 * reason a person could infer — you would drag the edge of the floating card and nothing
 * would happen.
 *
 * The drag maths lived inline in `Workspace.tsx`, which is why it only existed once. Pulling
 * it out here is what makes "the overlay resizes too" a matter of attaching a handle rather
 * than a second copy of the same pointer bookkeeping drifting away from the first.
 *
 * Two behaviours worth keeping from the original:
 *
 * The width is committed to preferences on release, not per frame. A drag is one decision,
 * and writing to storage sixty times a second to record the middle of it is how a
 * preference file becomes a hot loop.
 *
 * Window-level listeners rather than element ones, so the pointer can leave the two-pixel
 * handle mid-drag — which it always does — without the drag ending.
 */

export interface PanelResizeOptions {
  /** The stored width to start from and fall back to. */
  readonly committed: number;
  readonly min: number;
  readonly max: number;
  /** How much room the panel has to live in, measured when a drag starts. */
  readonly roomFor: () => number;
  /**
   * How much of that room must stay with the slide.
   *
   * The panel is on the right in both layouts, so `max` alone is not enough: on a narrow
   * window 720px of notes would leave the slide with nothing. This is the floor the slide
   * keeps whatever the drag asks for.
   */
  readonly reserve: number;
  readonly commit: (width: number) => void;
}

export interface PanelResize {
  /** The live width. Follows the drag, then settles on the committed value. */
  readonly width: number;
  /** True while a drag is in flight, for the handle's own styling. */
  readonly dragging: boolean;
  /** Attach to a `role="separator"` handle, in either layout. */
  readonly onPointerDown: (event: PointerEvent) => void;
  /** Arrow keys on the same handle. A drag nobody can do without a mouse is half a control. */
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

/** How far one arrow press moves the edge. Coarse enough to be useful, fine enough to aim. */
const KEY_STEP = 24;

export function usePanelResize(options: PanelResizeOptions): PanelResize {
  const { committed, min, max, roomFor, reserve, commit } = options;
  const [width, setWidth] = useState(committed);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setWidth(committed), [committed]);

  /** The widest the panel may be right now, given the room and the slide's floor. */
  const ceiling = useCallback((): number => {
    const room = roomFor();
    if (room <= 0) return max;
    return Math.max(min, Math.min(max, room - reserve));
  }, [max, min, reserve, roomFor]);

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      // A drag must not also select the text under it or start a native image drag.
      event.preventDefault();
      setDragging(true);

      const startX = event.clientX;
      const startWidth = width;
      const limit = ceiling();

      /* Leftward is wider, in both layouts, because the panel is anchored to the right edge
         in both. The overlay floats and the split docks, but the edge you grab is the same
         edge and it moves the same way — which is the point of one hook. */
      const onMove = (move: globalThis.PointerEvent) => {
        setWidth(clamp(startWidth - (move.clientX - startX), min, limit));
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setWidth((current) => {
          commit(current);
          return current;
        });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      // A touch drag interrupted by the browser fires this instead of `pointerup`, and
      // without it the listeners outlive the gesture.
      window.addEventListener('pointercancel', onUp);
    },
    [ceiling, commit, min, width],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      // The workspace binds single letters as shortcuts; an arrow on a handle is not one.
      event.stopPropagation();
      const next = clamp(width + (event.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP), min, ceiling());
      setWidth(next);
      commit(next);
    },
    [ceiling, commit, min, width],
  );

  return { width, dragging, onPointerDown, onKeyDown };
}
