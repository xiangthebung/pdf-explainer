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
  pinned,
  onTogglePin,
  onDock,
  onClose,
  children,
}: {
  width: number;
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

  const active = pinned || awake || greeting;

  return (
    <div
      ref={ref}
      aria-label="Floating notes"
      style={{ width: `${width}px` }}
      className={cx(
        'group/notes absolute right-3 top-3 bottom-[74px] z-20 flex max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[20px] border transition-[opacity,box-shadow,border-color] duration-300 ease-out',
        active
          ? 'border-line-strong opacity-100 shadow-float'
          : 'border-line/60 opacity-[0.26] shadow-soft hover:opacity-100',
      )}
    >
      {/* Frosted backing: the slide shows through, the text stays legible. */}
      <div className="absolute inset-0 -z-10 bg-elevated backdrop-blur-2xl" aria-hidden="true" />

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

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
