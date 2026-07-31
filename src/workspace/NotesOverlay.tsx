import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelRight, Pin, PinOff, RotateCcw, X } from 'lucide-react';
import { cx } from '../lib/utils';
import { IconButton } from '../components/ui/Button';
import { useFloatingPanel, type Edge, type Rect, type Size } from '../hooks/useFloatingPanel';

/**
 * Notes that float over a full-bleed slide.
 *
 * The slide never gives up a pixel: the card sits on top of it, resting at low opacity so
 * the diagram behind stays readable, and coming fully awake the moment the pointer or the
 * keyboard arrives. Pinning it keeps it awake for people who want to read and click through
 * slides at the same time.
 *
 * It is a window, not a panel. It was pinned to the top right — `absolute right-3 top-3
 * bottom-[74px]` with an adjustable width — which is a docked column drawn on top of the
 * slide: if the notes covered the diagram you were trying to read, the only adjustment
 * available was "wider". Now it moves by its header and resizes from all eight edges, and
 * `useFloatingPanel` keeps it inside the stage and remembers where you left it.
 */

/**
 * The eight handles.
 *
 * `size` is the grab thickness. 8px is wider than the 1px border it sits on, because a
 * hairline is not a target — the old single handle was 2px of hit area and had to be found
 * by feel.
 *
 * `cursor` is doing real work here rather than decoration: on a card with no visible grips
 * at rest, the pointer changing shape is the entire discovery mechanism for the whole
 * feature.
 */
const HANDLES: readonly { edge: Edge; className: string }[] = [
  { edge: 'n', className: 'left-3 right-3 -top-1 h-2 cursor-ns-resize' },
  { edge: 's', className: 'left-3 right-3 -bottom-1 h-2 cursor-ns-resize' },
  { edge: 'w', className: 'top-3 bottom-3 -left-1 w-2 cursor-ew-resize' },
  { edge: 'e', className: 'top-3 bottom-3 -right-1 w-2 cursor-ew-resize' },
  { edge: 'nw', className: '-top-1 -left-1 h-4 w-4 cursor-nwse-resize' },
  { edge: 'se', className: '-bottom-1 -right-1 h-4 w-4 cursor-nwse-resize' },
  { edge: 'ne', className: '-top-1 -right-1 h-4 w-4 cursor-nesw-resize' },
  { edge: 'sw', className: '-bottom-1 -left-1 h-4 w-4 cursor-nesw-resize' },
];

export function NotesOverlay({
  rect,
  fallback,
  min,
  onRectChange,
  onResetRect,
  pinned,
  onTogglePin,
  onDock,
  onClose,
  children,
}: {
  rect: Rect | null;
  fallback: (bounds: Size) => Rect;
  min: Size;
  onRectChange: (rect: Rect) => void;
  /** Puts it back where it started, for when it has been dragged somewhere unhelpful. */
  onResetRect: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onDock: () => void;
  onClose: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  /** Awake on arrival, so switching modes never looks like nothing happened. */
  const [greeting, setGreeting] = useState(true);
  const [awake, setAwake] = useState(false);

  const panel = useFloatingPanel({ ref, rect, fallback, min, commit: onRectChange });

  useEffect(() => {
    const timer = setTimeout(() => setGreeting(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  /* Tracked in state rather than left to :hover, so a click inside the card keeps it awake
     even when the pointer slips off the edge, and so keyboard focus wakes it too. */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const wake = () => setAwake(true);
    const sleepIfDone = () => {
      // Give focus a tick to settle inside the card before deciding.
      requestAnimationFrame(() => {
        if (!node.matches(':hover') && !node.contains(document.activeElement)) setAwake(false);
      });
    };

    node.addEventListener('pointerenter', wake);
    node.addEventListener('pointerleave', sleepIfDone);
    node.addEventListener('focusin', wake);
    node.addEventListener('focusout', sleepIfDone);
    return () => {
      node.removeEventListener('pointerenter', wake);
      node.removeEventListener('pointerleave', sleepIfDone);
      node.removeEventListener('focusin', wake);
      node.removeEventListener('focusout', sleepIfDone);
    };
  }, []);

  /**
   * Nothing selects while the panel is being dragged.
   *
   * Without this, dragging the header across the slide sweeps a selection through whatever
   * text is under the pointer — the notes' own body, mostly — and leaves it highlighted when
   * you let go. `preventDefault` on the pointerdown is not enough once the pointer has left
   * the element it started on.
   */
  useEffect(() => {
    if (!panel.gesture) return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [panel.gesture]);

  const dragging = panel.gesture !== false;
  // A gesture has to keep the card awake even though the pointer is outside it by then.
  const active = pinned || awake || greeting || dragging;

  return (
    <div
      ref={ref}
      aria-label="Floating notes"
      style={
        panel.rect
          ? {
              left: `${panel.rect.x}px`,
              top: `${panel.rect.y}px`,
              width: `${panel.rect.width}px`,
              height: `${panel.rect.height}px`,
            }
          : // Before the stage has been measured. Off-screen rather than at a guessed
            // position that would visibly jump once the real one arrives.
            { left: 0, top: 0, width: `${min.width}px`, height: `${min.height}px`, visibility: 'hidden' }
      }
      className={cx(
        'group/notes absolute z-20 flex flex-col rounded-[20px] border',
        // No transition on the geometry: it is driven per frame by a pointer, and easing a
        // value that is already following your hand only makes the card lag behind it.
        'transition-[opacity,box-shadow,border-color] duration-300 ease-out',
        active
          ? 'border-line-strong opacity-100 shadow-float'
          : 'border-line/60 opacity-[0.26] shadow-soft hover:opacity-100',
        dragging && 'select-none',
      )}
    >
      {/* Frosted backing: the slide shows through, the text stays legible.
          `overflow-hidden` lives here and on the body rather than on the card, because the
          resize handles reach a few pixels outside the rounded border to be grabbable and
          were being clipped away by it. */}
      <div
        className="absolute inset-0 -z-10 overflow-hidden rounded-[20px] bg-elevated backdrop-blur-2xl"
        aria-hidden="true"
      />

      {/* --------------------------------------------------------------- header
          The drag handle, and the one keyboard route to everything the eight handles do:
          arrows move, Shift and arrows resize. `role="separator"` is the closest ARIA has
          to a draggable resizer and is what the docked divider uses, so the two controls
          are the same kind of thing to a screen reader as they are to a mouse.

          The pin, dock and close buttons live in here too. `useFloatingPanel` ignores a
          press that landed on a `<button>`, so all three still work. */}
      <div
        {...panel.moveHandleProps}
        role="separator"
        aria-label="Move or resize the floating notes. Arrow keys move; hold Shift to resize."
        tabIndex={0}
        title="Drag to move · Shift+arrows to resize"
        className={cx(
          'flex h-9 shrink-0 touch-none items-center gap-1 rounded-t-[19px] border-b border-line px-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <span className="ml-1 flex-1 select-none text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Notes overlay
        </span>
        {/* Only once it has been moved. A reset that does nothing is a button that teaches
            you it does nothing. */}
        {rect ? (
          <IconButton label="Put the notes back in the corner" size="sm" onClick={onResetRect}>
            <RotateCcw className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        <IconButton
          label={pinned ? 'Let the notes fade when you move away' : 'Keep the notes visible'}
          size="sm"
          active={pinned}
          onClick={onTogglePin}
        >
          {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </IconButton>
        <IconButton label="Dock the notes beside the slide" size="sm" onClick={onDock}>
          <PanelRight className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Hide the notes" size="sm" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-b-[19px]">{children}</div>

      {/* ------------------------------------------------------- resize handles
          Pointer affordances, with a complete keyboard equivalent on the header — so they
          are hidden from assistive tech rather than adding eight tab stops to a card for
          grips a keyboard user cannot see.

          Invisible at rest and tinted while the card is awake. The cursor is the discovery
          mechanism, which is why every one of them declares its own. */}
      {HANDLES.map(({ edge, className }) => (
        <span
          key={edge}
          {...panel.resizeHandleProps(edge)}
          aria-hidden="true"
          className={cx(
            'absolute z-30 touch-none rounded-full transition-colors',
            className,
            panel.gesture === edge ? 'bg-accent' : 'bg-transparent hover:bg-accent/60',
          )}
        />
      ))}

      {/* A grip in the bottom-right corner, because a window with no visible affordance is a
          window nobody tries to resize. Only while the card is awake. */}
      <span
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
      >
        <svg viewBox="0 0 12 12" className="h-full w-full text-ink-3">
          <g fill="currentColor">
            <circle cx="10" cy="10" r="1" />
            <circle cx="6" cy="10" r="1" />
            <circle cx="10" cy="6" r="1" />
          </g>
        </svg>
      </span>
    </div>
  );
}
