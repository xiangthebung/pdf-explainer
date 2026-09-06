import { useEffect, useId, useState } from 'react';
import { BookOpen, Clock, FastForward, MessageSquare, Pause, Play, Sparkles, Target } from 'lucide-react';
import { deckProgress, nextGapFrom } from '../state/reducer';
import { useStudy } from '../state/StudyContext';
import { Button, IconButton } from '../components/ui/Button';
import { Spinner } from '../components/ui/Feedback';
import { Segmented, tabIdFor, type SegmentedOption } from '../components/ui/Surface';
import { ChatPanel, type AskPrompt } from './ChatPanel';
import { NotesPanel } from './NotesPanel';
import { PracticePanel } from './PracticePanel';

export type StudyTab = 'notes' | 'chat' | 'practice';

export const STUDY_TABS: SegmentedOption<StudyTab>[] = [
  { value: 'notes', label: 'Notes', icon: <BookOpen className="h-3.5 w-3.5" />, tint: 'violet' },
  { value: 'chat', label: 'Ask', icon: <MessageSquare className="h-3.5 w-3.5" />, tint: 'cyan' },
  { value: 'practice', label: 'Review', icon: <Target className="h-3.5 w-3.5" />, tint: 'amber' },
];

/**
 * The study surface: notes, tutor, review. One primary action lives in the
 * header and adapts to what the reader most likely needs next, which keeps the
 * "generate more" machinery out of the way while reading.
 */
export function StudyPanel({
  tab,
  onTabChange,
  onOpenSettings,
  showTabs = true,
  prompt = null,
  onPromptConsumed,
}: {
  tab: StudyTab;
  onTabChange: (next: StudyTab) => void;
  onOpenSettings: () => void;
  showTabs?: boolean;
  /** A question handed in from the slide, for the Ask tab. */
  prompt?: AskPrompt | null;
  onPromptConsumed?: () => void;
}): React.JSX.Element {
  const { state, actions, needsKey } = useStudy();
  const panelId = useId();
  const progress = deckProgress(state);
  const running = state.explain.status === 'running';
  const currentExplained = Boolean(state.notes[state.currentSlide]);

  const nextAction = (() => {
    if (needsKey || running) return null;
    if (!currentExplained) return { label: 'Explain from here', from: state.currentSlide };
    if (progress.nextGap !== null) return { label: `Continue from ${progress.nextGap}`, from: progress.nextGap };
    return null;
  })();

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg" aria-label="Study panel">
      {showTabs ? (
        <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
          <Segmented options={STUDY_TABS} value={tab} onChange={onTabChange} label="Study view" panelId={panelId} />
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {tab === 'notes' ? <ReadAheadStatus /> : null}
            {tab === 'notes' && nextAction ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                onClick={() => void actions.explainFrom(nextAction.from)}
              >
                <span className="hidden sm:inline">{nextAction.label}</span>
                <span className="sm:hidden">Explain</span>
              </Button>
            ) : null}
          </div>
        </header>
      ) : null}

      {/* Only a tab panel when the tabs are here. On a phone the strip that
          switches these lives in the workspace bar, and naming a tab that this
          component did not render would be a dangling reference. */}
      <div
        id={showTabs ? panelId : undefined}
        role={showTabs ? 'tabpanel' : undefined}
        aria-labelledby={showTabs ? tabIdFor(panelId, tab) : undefined}
        className="min-h-0 flex-1"
      >
        {tab === 'notes' ? (
          <NotesPanel onOpenSettings={onOpenSettings} />
        ) : tab === 'chat' ? (
          <ChatPanel onOpenSettings={onOpenSettings} prompt={prompt} onPromptConsumed={onPromptConsumed} />
        ) : (
          <PracticePanel onOpenSettings={onOpenSettings} />
        )}
      </div>
    </section>
  );
}

/** Seconds until a moment, ticking. Zero once it has passed or when there is none. */
function useCountdown(untilMs: number | null): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!untilMs) {
      setSeconds(0);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [untilMs]);
  return seconds;
}

/**
 * Read-ahead, in the notes header: a quiet line while it works, a countdown
 * while it waits out a rate limit, and one switch that pauses or resumes it.
 *
 * Nothing at all while there is nothing for it to do — before the first batch,
 * on the demo, without a key, or once the deck is covered — because a control
 * for a thing that cannot happen is a control that teaches you it does nothing.
 */
function ReadAheadStatus(): React.JSX.Element | null {
  const { state, actions, needsKey } = useStudy();
  const seconds = useCountdown(state.explain.waitUntil);
  if (!state.source || state.isDemo || needsKey) return null;
  if (Object.keys(state.notes).length === 0) return null;

  const gapAhead = nextGapFrom(state, state.currentSlide);
  const ahead = state.explain.status === 'running' && state.explain.mode === 'ahead';
  const waiting = state.readAhead && seconds > 0;

  if (!state.readAhead) {
    if (gapAhead === null) return null;
    return (
      <span className="flex min-w-0 items-center gap-1 text-[12px] text-ink-3" data-readahead="paused">
        <span className="truncate">Read-ahead paused</span>
        <IconButton label="Resume read-ahead" size="sm" onClick={() => actions.setReadAhead(true)}>
          <Play className="h-3.5 w-3.5" />
        </IconButton>
      </span>
    );
  }

  if (ahead || waiting) {
    return (
      <span
        className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2"
        role="status"
        data-readahead={ahead ? 'running' : 'waiting'}
      >
        {ahead ? <Spinner className="shrink-0 border-t-violet" /> : <Clock className="h-3.5 w-3.5 shrink-0 text-amber" />}
        <span className="truncate">{ahead ? 'Explaining ahead…' : `Rate limited · resumes in ${seconds}s`}</span>
        <IconButton label="Pause read-ahead" size="sm" onClick={() => actions.setReadAhead(false)}>
          <Pause className="h-3.5 w-3.5" />
        </IconButton>
      </span>
    );
  }

  if (gapAhead === null) return null;
  return (
    <IconButton
      label="Read-ahead is on: the next slides are explained as you approach them. Pause it"
      size="sm"
      active
      onClick={() => actions.setReadAhead(false)}
      data-readahead="on"
    >
      <FastForward className="h-3.5 w-3.5" />
    </IconButton>
  );
}
