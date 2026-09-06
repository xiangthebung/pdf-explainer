import { useEffect } from 'react';
import { History, X } from 'lucide-react';
import { relativeTime } from '../lib/utils';
import { Button, IconButton } from '../components/ui/Button';

/** How long the card stays if nobody touches it. Long enough to read, short enough to forget. */
const LINGER_MS = 15_000;

/** What the card says about the session that was reopened. */
export interface ResumeNotice {
  name: string;
  slide: number;
  total: number;
  updatedAt: number;
}

/**
 * "Picked up where you left off."
 *
 * A session that reopens on its own needs to say so, and needs a way out: the
 * deck you had open last night is not always the deck you came for. The card
 * floats over the top of the slide, out of the way of the notes, and leaves on
 * a click, a slide change or a timer.
 */
export function ResumeCard({
  name,
  slide,
  total,
  updatedAt,
  onDismiss,
  onStartOver,
}: {
  name: string;
  slide: number;
  total: number;
  updatedAt: number;
  onDismiss: () => void;
  onStartOver: () => void;
}): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, LINGER_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-label="Picked up where you left off"
      className="animate-in pointer-events-auto absolute left-1/2 top-3 z-20 w-[min(calc(100%-1.5rem),460px)] -translate-x-1/2 rounded-[16px] border border-line bg-elevated p-3 shadow-float backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <span className="tint-violet tint-chip mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]">
          <History className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">Picked up where you left off</p>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-2" title={name}>
            {name} · slide {slide} of {total} · {relativeTime(updatedAt)}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={onDismiss}>
              Keep reading
            </Button>
            <Button size="sm" variant="secondary" onClick={onStartOver}>
              Start something else
            </Button>
          </div>
        </div>
        <IconButton label="Dismiss" size="sm" onClick={onDismiss} className="-mr-1 -mt-1">
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );
}
