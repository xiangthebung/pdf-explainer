import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import type { SlideNote } from '~shared/types';
import { formatDuration, plural } from '../lib/utils';
import { nextGapFrom, slideProgress } from '../state/reducer';
import { READ_AHEAD_DISTANCE } from '../state/readAhead';
import { useStudy } from '../state/StudyContext';
import type { ExplainJob } from '../state/types';
import { Button } from '../components/ui/Button';
import { EmptyState, NoteSkeleton, Notice, Spinner } from '../components/ui/Feedback';
import { styleLabel } from '../components/ui/StylePicker';
import { Chip } from '../components/ui/Surface';
import { ClozeCard } from '../practice/ClozeCard';
import { MatchGame } from '../practice/MatchGame';
import { QuizCard } from '../practice/QuizCard';
import { WorkedExampleCard } from '../practice/WorkedExampleCard';
import { Block } from './NoteBlocks';
import { ReexplainMenu } from './ReexplainMenu';

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

  /**
   * One short line when notes land, for a reader who cannot see them appear.
   *
   * Not the note itself. Marking the article live means the whole thing is
   * re-read from the top every time the next batch extends it, which is worse
   * than silence — so this says what arrived and leaves the reading to the
   * reader.
   */
  const [arrivals, setArrivals] = useState('');
  const seenSlides = useRef<Set<number> | null>(null);

  useEffect(() => {
    const slides = Object.keys(state.notes)
      .map(Number)
      .sort((a, b) => a - b);
    const previous = seenSlides.current;
    seenSlides.current = new Set(slides);
    // The first pass sets the baseline rather than announcing it: a restored
    // session opens with notes already in it and has generated nothing.
    if (!previous) return;
    const arrived = slides.filter((page) => !previous.has(page));
    if (arrived.length === 0) return;
    const first = arrived[0];
    const last = arrived[arrived.length - 1];
    setArrivals(first === last ? `Notes ready for slide ${first}` : `Notes ready for slides ${first} to ${last}`);
  }, [state.notes]);

  /* The scroller is a tab stop of its own, because a long note is unreadable
     otherwise: the arrows and Page keys that would scroll it are bound to the
     deck at the window, and `data-scroll-region` is what tells them to stand
     down while focus is in here. `role="region"` because a bare div is
     `generic`, and a generic element cannot carry a name. */
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      role="region"
      aria-label={`Notes for slide ${slide}`}
      tabIndex={0}
      data-scroll-region
      className="scroll-area h-full overflow-y-auto"
    >
      <div className="mx-auto max-w-[720px] px-4 pb-24 pt-4 sm:px-6">
        <p role="status" className="sr-only">
          {arrivals}
        </p>

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
          <ExplainingState job={state.explain} slide={slide} onCancel={actions.cancelExplain} />
        ) : (
          <NotExplainedYet slide={slide} needsKey={needsKey} onOpenSettings={onOpenSettings} />
        )}

        {/* Review items live here too, note or no note. Jumping from a review
            card to its slide should land you next to the thing you got wrong. */}
        <ReviewSetForSlide slide={slide} />

        {note && running ? (
          <p className="mt-6 flex items-center justify-center gap-2 text-[12.5px] text-ink-2" role="status">
            <Spinner /> {describeRunning(state.explain, slide)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** What a running job is doing, from where the reader is standing. */
function describeRunning(job: ExplainJob, slide: number): string {
  const from = job.from ?? slide;
  if (job.mode === 'single') {
    return from === slide
      ? `Rewriting this slide as ${styleLabel(job.style ?? 'auto')}…`
      : `Rewriting slide ${from} as ${styleLabel(job.style ?? 'auto')}…`;
  }
  if (job.mode === 'ahead') return `Explaining ahead from slide ${from}…`;
  return `Working through slide ${from} onwards…`;
}

function NoteBody({ note }: { note: SlideNote }): React.JSX.Element {
  const { state, actions, needsKey } = useStudy();
  const progress = slideProgress(state, note.slide);
  const hasPractice = progress.practiceTotal > 0;
  const rewriting =
    state.explain.status === 'running' && state.explain.mode === 'single' && state.explain.from === note.slide;

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
          {/* Ask for this one slide again in another voice. Not on the demo, whose
              notes are the fixture, and not without a key to ask with. */}
          {!needsKey && !state.isDemo ? (
            <div className="ml-auto">
              <ReexplainMenu
                currentStyle={state.style}
                busy={rewriting}
                disabled={state.explain.status === 'running'}
                onPick={(style) => void actions.reexplainSlide(note.slide, style)}
              />
            </div>
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
  job,
  slide,
  onCancel,
}: {
  job: ExplainJob;
  slide: number;
  onCancel: () => void;
}): React.JSX.Element {
  const elapsed = useElapsed(job.startedAt);
  const from = job.from ?? slide;
  const label =
    job.mode === 'ahead' && from > slide ? `Explaining ahead from slide ${from}` : `Reading slide ${from} onwards`;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <Spinner />
          {label}
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
  /* Read-ahead is about to fetch this one: it is idle only while it waits out
     the model's pacing. Say so, rather than presenting a button the app is
     about to press for you. */
  const gap = nextGapFrom(state, slide);
  const queued =
    state.readAhead &&
    !needsKey &&
    !state.isDemo &&
    explainedCount > 0 &&
    state.explain.status === 'idle' &&
    gap !== null &&
    gap - slide <= READ_AHEAD_DISTANCE;

  return (
    <EmptyState
      className="py-16"
      tint="violet"
      icon={<Sparkles className="h-5 w-5" />}
      title={explainedCount === 0 ? 'Start with slide 1' : `Slide ${slide} is not explained yet`}
      description={
        explainedCount === 0
          ? `${plural(state.totalSlides, 'slide')} ready. Notes are generated in small batches so you can start reading within seconds.`
          : queued
            ? 'Read-ahead is fetching this one next. Notes arrive on their own as you get close to them.'
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
            {explainedCount === 0 ? 'Explain this deck' : queued ? `Explain slide ${slide} now` : `Explain from slide ${slide}`}
          </Button>
        )
      }
    />
  );
}
