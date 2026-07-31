import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelRight, Pin, PinOff, X } from 'lucide-react';
import { cx } from '../lib/utils';
import { IconButton } from '../components/ui/Button';

/**
 * Notes that float over a full-bleed slide.
 *
 * The slide never gives up a pixel: the card sits on top of it, resting at low
 * opacity so the diagram behind stays readable, and coming fully awake the
 * moment the pointer or the keyboard arrives. Pinning it keeps it awake for
 * people who want to read and click through slides at the same time.
 */
export function NotesOverlay({
  width,
  minWidth,
  maxWidth,
  resizing,
  onResizePointerDown,
  onResizeKeyDown,
  pinned,
  onTogglePin,
  onDock,
  onClose,
  children,
}: {
  width: number;
  minWidth: number;
  maxWidth: number;
  resizing: boolean;
  onResizePointerDown: (event: React.PointerEvent) => void;
  onResizeKeyDown: (event: React.KeyboardEvent) => void;
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

  useEffect(() => {
    const timer = setTimeout(() => setGreeting(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  /* Tracked in state rather than left to :hover, so a click inside the card
     keeps it awake even when the pointer slips off the edge, and so keyboard
     focus wakes it too. */
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

  // A drag has to keep the card awake even though the pointer is outside it by then.
  const active = pinned || awake || greeting || resizing;

  return (
    <div
      ref={ref}
      aria-label="Floating notes"
      style={{ width: `${width}px` }}
      className={cx(
        'group/notes absolute right-3 top-3 bottom-[74px] z-20 flex max-w-[calc(100%-2rem)] flex-col rounded-[20px] border transition-[opacity,box-shadow,border-color] duration-300 ease-out',
        active
          ? 'border-line-strong opacity-100 shadow-float'
          : 'border-line/60 opacity-[0.26] shadow-soft hover:opacity-100',
      )}
    >
      {/* Frosted backing: the slide shows through, the text stays legible.
          `overflow-hidden` moved off the card and onto the content below, because the
          resize handle has to reach a few pixels outside the rounded border to be grabbable
          and was being clipped away by it. */}
      <div
        className="absolute inset-0 -z-10 overflow-hidden rounded-[20px] bg-elevated backdrop-blur-2xl"
        aria-hidden="true"
      />

      {/* The left edge, draggable.
          The card floats over the slide and is anchored to the right, so its left edge is
          the one that changes its width — the same edge, moving the same way, as the split
          view's divider. Both are handles onto `usePanelResize`; before it, this edge did
          nothing and the notes could only be resized in the other layout.

          A real `separator` with its values and arrow keys, not a bare drag target: this is
          the same control as the divider and it should be the same control to a screen
          reader and to somebody without a mouse. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the floating notes"
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onPointerDown={onResizePointerDown}
        onKeyDown={onResizeKeyDown}
        className={cx(
          'absolute inset-y-4 -left-1 z-30 w-2 cursor-col-resize rounded-full transition-colors',
          'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
          resizing ? 'bg-accent' : 'bg-transparent',
        )}
      >
        {/* A grip, so the edge looks like something you can pull. Only once the card is
            awake — an idle overlay at a quarter opacity should not sprout handles. */}
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity',
            active ? 'bg-line-strong opacity-100' : 'opacity-0',
          )}
        />
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="ml-1 flex-1 select-none text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Notes overlay
        </span>
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

      <div className="min-h-0 flex-1 overflow-hidden rounded-b-[20px]">{children}</div>
    </div>
  );
}
