import { BookOpen, MessageSquare, Sparkles, Target } from 'lucide-react';
import { deckProgress } from '../state/reducer';
import { useStudy } from '../state/StudyContext';
import { Button } from '../components/ui/Button';
import { Segmented, type SegmentedOption } from '../components/ui/Surface';
import { ChatPanel } from './ChatPanel';
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
}: {
  tab: StudyTab;
  onTabChange: (next: StudyTab) => void;
  onOpenSettings: () => void;
  showTabs?: boolean;
}): React.JSX.Element {
  const { state, actions, needsKey } = useStudy();
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
          <Segmented options={STUDY_TABS} value={tab} onChange={onTabChange} label="Study view" />
          <div className="ml-auto flex items-center gap-1.5">
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

      <div className="min-h-0 flex-1">
        {tab === 'notes' ? (
          <NotesPanel onOpenSettings={onOpenSettings} />
        ) : tab === 'chat' ? (
          <ChatPanel onOpenSettings={onOpenSettings} />
        ) : (
          <PracticePanel onOpenSettings={onOpenSettings} />
        )}
      </div>
    </section>
  );
}
