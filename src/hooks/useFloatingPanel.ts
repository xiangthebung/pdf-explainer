import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { clamp } from '../lib/utils';

/**
 * A panel you can move and resize from any edge, inside whatever contains it.
 *
 * The floating notes started as a card pinned to the top right of the slide with one
 * adjustable dimension: `absolute right-3 top-3 bottom-[74px]` plus a width. That is a
 * docked column drawn on top of the slide rather than a window, and it behaved like one —
 * you could make it wider and nothing else. If the notes cover the diagram you are trying
 * to read, "wider" is not the adjustment you want.
 *
 * So it is a window now. Eight handles, a draggable header, clamped to its container, and
 * the whole rect remembered rather than one number of it.
 *
 * WHY THIS IS NOT `usePanelResize`
 *
 * The docked divider changes one number and lets the grid do the rest; there is no
 * position to speak of, and the constraint is one-dimensional. This owns four numbers and
 * has to keep all of them inside a box that changes size when the window does. The two
 * share about six lines — "drag with the pointer, commit on release" — and merging them
 * would mean a hook with a mode flag and two thirds of its body behind an `if`.
 *
 * WHAT IS PERSISTED, AND WHEN
 *
 * The rect is committed to preferences on release, never per frame. A drag is one
 * decision, and writing to `localStorage` sixty times a second to record the middle of it
 * is how a preferences file becomes a hot loop.
 *
 * `rect` stays `null` until the container has been measured, so nothing renders at a
 * guessed position and then jumps. The caller supplies `fallback` for the geometry to use
 * before the panel has ever been placed by hand — which is how the default still looks
 * exactly like the pinned card it replaced.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Compass points. `nw` is the top-left corner, `w` the left edge, and so on. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** What the panel is currently doing, for the handles' own styling. */
export type PanelGesture = false | 'move' | Edge;

export interface FloatingPanelOptions {
  /** The panel element. Its `offsetParent` is the box it has to stay inside. */
  readonly ref: RefObject<HTMLElement | null>;
  /** The remembered rect, or `null` if it has never been placed by hand. */
  readonly rect: Rect | null;
  /** Where it sits before it has been placed. Called with the measured container. */
  readonly fallback: (bounds: Size) => Rect;
  readonly min: Size;
  readonly commit: (rect: Rect) => void;
}

export interface FloatingPanel {
  /** `null` until the container has been measured. Do not render before then. */
  readonly rect: Rect | null;
  readonly gesture: PanelGesture;
  /** For the header. Arrow keys move it; hold Shift and they resize it. */
  readonly moveHandleProps: {
    readonly onPointerDown: (event: PointerEvent) => void;
    readonly onKeyDown: (event: KeyboardEvent) => void;
  };
  /** For each of the eight edges and corners. */
  readonly resizeHandleProps: (edge: Edge) => {
    readonly onPointerDown: (event: PointerEvent) => void;
  };
}

/** How far one arrow press moves or grows the panel. */
const STEP = 16;

/**
 * Applies a drag on one edge, keeping the opposite edge exactly where it was.
 *
 * The two halves of each axis are deliberately asymmetric. Dragging the west edge moves
 * `x` *and* changes `width`, and it has to stop when the panel hits its minimum — at which
 * point `x` is pinned to `right - min.width`, not to wherever the pointer has gone. Doing
 * it the obvious way (clamp the width, then derive x) lets the panel creep sideways every
 * frame you keep pulling past the limit.
 */
export function applyEdge(edge: Edge, start: Rect, dx: number, dy: number, bounds: Size, min: Size): Rect {
  let { x, y, width, height } = start;

  if (edge.includes('w')) {
    const right = start.x + start.width;
    x = clamp(start.x + dx, 0, right - min.width);
    width = right - x;
  } else if (edge.includes('e')) {
    width = clamp(start.width + dx, min.width, bounds.width - start.x);
  }

  if (edge.includes('n')) {
    const bottom = start.y + start.height;
    y = clamp(start.y + dy, 0, bottom - min.height);
    height = bottom - y;
  } else if (edge.includes('s')) {
    height = clamp(start.height + dy, min.height, bounds.height - start.y);
  }

  return { x, y, width, height };
}

/** Keeps a rect inside its container without changing its size unless it has to. */
export function contain(rect: Rect, bounds: Size, min: Size): Rect {
  const width = clamp(rect.width, min.width, Math.max(min.width, bounds.width));
  const height = clamp(rect.height, min.height, Math.max(min.height, bounds.height));
  return {
    width,
    height,
    x: clamp(rect.x, 0, Math.max(0, bounds.width - width)),
    y: clamp(rect.y, 0, Math.max(0, bounds.height - height)),
  };
}

export function useFloatingPanel(options: FloatingPanelOptions): FloatingPanel {
  const { ref, rect: committed, fallback, min, commit } = options;

  const [bounds, setBounds] = useState<Size | null>(null);
  /** Set only while a gesture is in flight; otherwise the committed rect wins. */
  const [live, setLive] = useState<Rect | null>(null);
  const [gesture, setGesture] = useState<PanelGesture>(false);

  /**
   * Measure the box the panel has to stay inside.
   *
   * `offsetParent` rather than a ref threaded down from whoever renders the container: the
   * panel is absolutely positioned, so the browser already knows which element its
   * coordinates are relative to, and asking it is both shorter and impossible to get out
   * of step with the CSS.
   */
  useEffect(() => {
    const node = ref.current;
    const parent = node?.offsetParent;
    if (!(parent instanceof HTMLElement)) return;

    const read = () => setBounds({ width: parent.clientWidth, height: parent.clientHeight });
    read();

    const observer = new ResizeObserver(read);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [ref]);

  /* The rect to draw. A committed rect is contained rather than re-committed: shrinking
     the window should not quietly overwrite the size you chose, so the clamp is for
     display and the next deliberate drag is what persists. */
  const resolved: Rect | null =
    bounds === null ? null : live ?? contain(committed ?? fallback(bounds), bounds, min);

  /** One code path for both kinds of gesture; `edge` of `null` means "move". */
  const begin = useCallback(
    (event: PointerEvent, edge: Edge | null) => {
      if (bounds === null || resolved === null) return;
      event.preventDefault();
      event.stopPropagation();

      const start = resolved;
      const originX = event.clientX;
      const originY = event.clientY;
      setGesture(edge ?? 'move');

      const onMove = (move: globalThis.PointerEvent) => {
        const dx = move.clientX - originX;
        const dy = move.clientY - originY;
        setLive(
          edge === null
            ? {
                ...start,
                x: clamp(start.x + dx, 0, Math.max(0, bounds.width - start.width)),
                y: clamp(start.y + dy, 0, Math.max(0, bounds.height - start.height)),
              }
            : applyEdge(edge, start, dx, dy, bounds, min),
        );
      };

      const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        setGesture(false);
        setLive((current) => {
          if (current) commit(current);
          // Back to the committed value, which is about to arrive as a prop.
          return null;
        });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      /* A touch drag the browser takes over — a scroll gesture it decides to own, a call
         arriving — fires this and not `pointerup`. Without it the listeners outlive the
         gesture and the panel follows the pointer forever. */
      window.addEventListener('pointercancel', finish);
    },
    [bounds, commit, min, resolved],
  );

  const onPointerDownMove = useCallback(
    (event: PointerEvent) => {
      /* The header holds the pin, dock and close buttons. A press on one of those is not
         the start of a drag, and swallowing it here would break all three. */
      if ((event.target as HTMLElement | null)?.closest('button')) return;
      begin(event, null);
    },
    [begin],
  );

  /**
   * The whole control, from one tab stop.
   *
   * Arrows move, Shift and arrows resize from the bottom right. That is deliberately not
   * eight focusable handles: anything a corner does two edges also do, and adding nine tab
   * stops to a floating card so that a keyboard user can reach a grip they cannot see is a
   * poor trade. The handles are pointer affordances with a complete keyboard equivalent,
   * which is why they are `aria-hidden` in the markup.
   */
  const onKeyDownMove = useCallback(
    (event: KeyboardEvent) => {
      const axis: Record<string, [number, number]> = {
        ArrowLeft: [-STEP, 0],
        ArrowRight: [STEP, 0],
        ArrowUp: [0, -STEP],
        ArrowDown: [0, STEP],
      };
      const delta = axis[event.key];
      if (!delta || bounds === null || resolved === null) return;
      event.preventDefault();
      // The workspace binds bare letters and arrows as slide shortcuts.
      event.stopPropagation();

      const [dx, dy] = delta;
      const next = event.shiftKey
        ? applyEdge('se', resolved, dx, dy, bounds, min)
        : contain({ ...resolved, x: resolved.x + dx, y: resolved.y + dy }, bounds, min);
      commit(next);
    },
    [bounds, commit, min, resolved],
  );

  const resizeHandleProps = useCallback(
    (edge: Edge) => ({ onPointerDown: (event: PointerEvent) => begin(event, edge) }),
    [begin],
  );

  return {
    rect: resolved,
    gesture,
    moveHandleProps: { onPointerDown: onPointerDownMove, onKeyDown: onKeyDownMove },
    resizeHandleProps,
  };
}
