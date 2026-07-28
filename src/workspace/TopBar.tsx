import { Download, Keyboard, Settings, X } from 'lucide-react';
import { deckProgress } from '../state/reducer';
import { useStudy } from '../state/StudyContext';
import { IconButton } from '../components/ui/Button';
import { ProgressRing } from '../components/ui/Feedback';
import { Chip } from '../components/ui/Surface';

export function TopBar({
  onOpenSettings,
  onOpenExport,
  onOpenShortcuts,
  onCloseDeck,
}: {
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onOpenShortcuts: () => void;
  onCloseDeck: () => void;
}): React.JSX.Element {
  const { state } = useStudy();
  const progress = deckProgress(state);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <IconButton label="Close this deck" size="sm" onClick={onCloseDeck}>
        <X className="h-4 w-4" />
      </IconButton>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
            {state.source?.name ?? 'Lecture'}
          </h1>
          {state.isDemo ? <Chip tone="indigo">Demo</Chip> : null}
        </div>
        <p className="truncate text-[12px] text-ink-3">
          Slide {state.currentSlide} of {state.totalSlides || '–'}
          {progress.practiceTotal > 0 ? (
            <span className="text-amber">
              {' '}
              · {progress.practiceDone}/{progress.practiceTotal} practice done
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-2 sm:flex" title={`${progress.explained} of ${progress.total} slides explained`}>
          <ProgressRing
            value={progress.percent}
            tint={progress.percent >= 100 ? 'good' : 'violet'}
            label={`${progress.explained} of ${progress.total} slides explained`}
          />
          <span className="text-[12px] tabular-nums text-ink-2">
            {progress.explained}/{progress.total}
          </span>
        </div>
        <IconButton label="Export notes" size="sm" onClick={onOpenExport}>
          <Download className="h-4 w-4" />
        </IconButton>
        <IconButton label="Keyboard shortcuts" size="sm" onClick={onOpenShortcuts} className="hidden sm:inline-flex">
          <Keyboard className="h-4 w-4" />
        </IconButton>
        <IconButton label="Settings" size="sm" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" />
        </IconButton>
      </div>
    </header>
  );
}
