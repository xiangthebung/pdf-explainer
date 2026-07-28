import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Compass,
  Eye,
  KeyRound,
  Lightbulb,
  RotateCcw,
  Route,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import type { CalloutKind, ContentBlock, SlideNote } from '~shared/types';
import { cx, formatDuration, plural } from '../lib/utils';
import { slideProgress } from '../state/reducer';
import { useStudy } from '../state/StudyContext';
import { Markdown } from '../components/content/Markdown';
import { Button } from '../components/ui/Button';
import { EmptyState, NoteSkeleton, Notice, Spinner } from '../components/ui/Feedback';
import { Chip, TINT_CLASS, type Tint } from '../components/ui/Surface';
import { ClozeCard } from '../practice/ClozeCard';
import { MatchGame } from '../practice/MatchGame';
import { QuizCard } from '../practice/QuizCard';
import { WorkedExampleCard } from '../practice/WorkedExampleCard';

/**
 * Each callout keeps one hue for the whole app. Skimming a long note, the
 * colours tell you what kind of thing you are about to read before you read a
 * word of it — which is most of the value of having callouts at all.
 */
const CALLOUTS: Record<CalloutKind, { label: string; icon: typeof Lightbulb; tint: Tint }> = {
  concept: { label: 'Key concept', icon: KeyRound, tint: 'violet' },
  intuition: { label: 'Intuition', icon: Lightbulb, tint: 'amber' },
  memory: { label: 'Memory hook', icon: Brain, tint: 'pink' },
  example: { label: 'In the real world', icon: Compass, tint: 'teal' },
  walkthrough: { label: 'Walkthrough', icon: Route, tint: 'indigo' },
  watchout: { label: 'Watch out', icon: TriangleAlert, tint: 'bad' },
};

export function NotesPanel({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const { state, actions, needsKey } = useStudy();
  const slide = state.currentSlide;
  const note = state.notes[slide];
  const running = state.explain.status === 'running';
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const positions = useRef<Map<number, number>>(new Map());

  /* Keep each slide's reading position, so flicking back and forth is painless. */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const saved = positions.current.get(slide) ?? 0;
    node.scrollTop = saved;
  }, [slide]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (node) positions.current.set(slide, node.scrollTop);
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="scroll-area h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-4 pb-24 pt-4 sm:px-6">
        {state.warnings.length > 0 ? (
          <Notice tone="warn" className="mb-4" title="Some items were skipped" onDismiss={actions.dismissWarnings}>
            <ul className="list-disc space-y-0.5 pl-4">
              {state.warnings.slice(0, 4).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {state.explain.status === 'error' && state.explain.error ? (
          <Notice
            tone="error"
            className="mb-4"
            title="Could not generate notes"
            onRetry={
              state.explain.error.retryable
                ? () => void actions.explainFrom(state.explain.from ?? slide)
                : state.explain.error.code === 'missing_key' || state.explain.error.code === 'invalid_key'
                  ? onOpenSettings
                  : undefined
            }
            retryLabel={
              state.explain.error.code === 'missing_key' || state.explain.error.code === 'invalid_key'
                ? 'Open settings'
                : 'Try again'
            }
            onDismiss={actions.dismissExplainError}
          >
            {state.explain.error.message}
          </Notice>
        ) : null}

        {note ? (
          <NoteBody note={note} />
        ) : running ? (
          <ExplainingState from={state.explain.from ?? slide} startedAt={state.explain.startedAt} onCancel={actions.cancelExplain} />
        ) : (
          <NotExplainedYet slide={slide} needsKey={needsKey} onOpenSettings={onOpenSettings} />
        )}

        {/* Review items live here too, note or no note. Jumping from a review
            card to its slide should land you next to the thing you got wrong. */}
        <ReviewSetForSlide slide={slide} />

        {note && running ? (
          <p className="mt-6 flex items-center justify-center gap-2 text-[12.5px] text-ink-2">
            <Spinner /> Working through slide {state.explain.from ?? slide} onwards…
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NoteBody({ note }: { note: SlideNote }): React.JSX.Element {
  const { state, actions } = useStudy();
  const progress = slideProgress(state, note.slide);
  const hasPractice = progress.practiceTotal > 0;

  return (
    <article>
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <Chip tone="violet">Slide {note.slide}</Chip>
          {hasPractice ? (
            <Chip tone={progress.practiceDone === progress.practiceTotal ? 'good' : 'amber'}>
              {progress.practiceDone}/{progress.practiceTotal} practice
            </Chip>
          ) : null}
        </div>
        {note.summary ? (
          <h2 className="mt-2.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{note.summary}</h2>
        ) : null}
      </header>

      {note.blocks.length > 0 ? (
        <div className="space-y-4">
          {note.blocks.map((block, index) => (
            <Block key={`${note.slide}-${index}`} block={block} />
          ))}
        </div>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          A title or transition slide — nothing to unpack here. Move on to the next one.
        </p>
      )}

      {note.worked ? (
        <div className="mt-6">
          <WorkedExampleCard example={note.worked} slide={note.slide} />
        </div>
      ) : null}

      {hasPractice ? (
        <section className="mt-8 border-t border-line pt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="tint-amber tint-text text-[12px] font-semibold uppercase tracking-[0.06em]">
              Check yourself
            </h3>
            {progress.practiceDone > 0 ? (
              <Button
                size="sm"
                variant="quiet"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => actions.resetSlideProgress(note.slide)}
              >
                Reset
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            {note.quiz.map((question, index) => (
              <QuizCard
                key={question.id}
                question={question}
                label={`Q${index + 1}`}
                chosen={state.quizAnswers[question.id]}
                onChoose={(choice) => actions.answerQuiz(question.id, choice)}
              />
            ))}
            {note.matching.map((set) => (
              <MatchGame
                key={set.id}
                set={set}
                completed={Boolean(state.completed[set.id])}
                onComplete={() => actions.completeItem(set.id)}
              />
            ))}
            {note.cloze.map((item) => (
              <ClozeCard
                key={item.id}
                item={item}
                completed={Boolean(state.completed[item.id])}
                onComplete={() => actions.completeItem(item.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

/**
 * The deck-wide review pass writes items with a slide number, so they belong on
 * that slide as well as in the Review tab. One generation, two useful places —
 * and it keeps this half of the product alive when a terse model skips the
 * per-slide practice entirely.
 */
function ReviewSetForSlide({ slide }: { slide: number }): React.JSX.Element | null {
  const { state, actions } = useStudy();
  const items = useMemo(
    () => state.practice.items.filter((item) => item.slide === slide),
    [state.practice.items, slide],
  );
  if (items.length === 0) return null;

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h3 className="tint-violet tint-text mb-3 text-[12px] font-semibold uppercase tracking-[0.06em]">
        From your review set
      </h3>
      <div className="space-y-3">
        {items.map((item, index) => {
          const answer = state.practice.answers[item.id];
          if (item.kind === 'quiz') {
            return (
              <QuizCard
                key={item.id}
                question={item}
                label={`R${index + 1}`}
                chosen={typeof answer === 'number' ? answer : undefined}
                onChoose={(choice) => actions.answerPractice(item.id, choice)}
              />
            );
          }
          if (item.kind === 'match') {
            return (
              <MatchGame
                key={item.id}
                set={item}
                completed={answer === true}
                onComplete={() => actions.answerPractice(item.id, true)}
              />
            );
          }
          return (
            <ClozeCard
              key={item.id}
              item={item}
              completed={answer === true}
              onComplete={() => actions.answerPractice(item.id, true)}
            />
          );
        })}
      </div>
    </section>
  );
}

function CalloutLabel({
  icon: Icon,
  label,
}: {
  icon: typeof Lightbulb;
  label: string;
}): React.JSX.Element {
  return (
    <>
      <span className="tint-chip flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px]">
        <Icon className="h-3 w-3" />
      </span>
      <span className="tint-text text-[12px] font-semibold uppercase tracking-[0.05em]">{label}</span>
    </>
  );
}

function Block({ block }: { block: ContentBlock }): React.JSX.Element {
  if (block.type === 'markdown') return <Markdown>{block.content}</Markdown>;

  const meta = CALLOUTS[block.callout];

  // Memory hooks are worth more when you try to recall them first.
  if (block.callout === 'memory') {
    return (
      <details
        className={cx(
          'group tint-card p-4 pl-5 [&_summary::-webkit-details-marker]:hidden',
          TINT_CLASS[meta.tint],
        )}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <CalloutLabel icon={meta.icon} label={meta.label} />
          <span className="tint-text ml-auto flex items-center gap-1 text-[11.5px] font-medium group-open:hidden">
            <Eye className="h-3 w-3" /> Reveal
          </span>
        </summary>
        <div className="mt-2.5">
          <Markdown>{block.content}</Markdown>
        </div>
      </details>
    );
  }

  return (
    <aside className={cx('tint-card p-4 pl-5', TINT_CLASS[meta.tint])}>
      <p className="mb-2 flex items-center gap-2">
        <CalloutLabel icon={meta.icon} label={meta.label} />
      </p>
      <Markdown>{block.content}</Markdown>
    </aside>
  );
}

/** Live elapsed time for a running job. Honest about how long this is taking. */
function useElapsed(startedAt: number | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!startedAt) {
      setLabel(null);
      return;
    }
    setLabel(formatDuration(Date.now() - startedAt));
    const timer = setInterval(() => setLabel(formatDuration(Date.now() - startedAt)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return label;
}

function ExplainingState({
  from,
  startedAt,
  onCancel,
}: {
  from: number;
  startedAt: number | null;
  onCancel: () => void;
}): React.JSX.Element {
  const elapsed = useElapsed(startedAt);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <Spinner />
          Reading slide {from} onwards
          {elapsed ? <span className="tabular-nums text-ink-3">· {elapsed}</span> : null}
        </p>
        <Button size="sm" variant="quiet" onClick={onCancel}>
          Stop
        </Button>
      </div>
      <NoteSkeleton />
    </div>
  );
}

function NotExplainedYet({
  slide,
  needsKey,
  onOpenSettings,
}: {
  slide: number;
  needsKey: boolean;
  onOpenSettings: () => void;
}): React.JSX.Element {
  const { state, actions } = useStudy();
  const explainedCount = Object.keys(state.notes).length;

  return (
    <EmptyState
      className="py-16"
      tint="violet"
      icon={<Sparkles className="h-5 w-5" />}
      title={explainedCount === 0 ? 'Start with slide 1' : `Slide ${slide} is not explained yet`}
      description={
        explainedCount === 0
          ? `${plural(state.totalSlides, 'slide')} ready. Notes are generated in small batches so you can start reading within seconds.`
          : 'Generating from here continues in small batches, keeping each explanation deep.'
      }
      action={
        needsKey ? (
          <div className="space-y-2">
            <Button block variant="primary" onClick={onOpenSettings}>
              Add your API key
            </Button>
            <p className="text-[12px] text-ink-3">Your key stays on this device.</p>
          </div>
        ) : (
          <Button block variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => void actions.explainFrom(slide)}>
            {explainedCount === 0 ? 'Explain this deck' : `Explain from slide ${slide}`}
          </Button>
        )
      }
    />
  );
}
