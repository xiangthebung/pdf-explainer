import { useMemo, useState } from 'react';
import { Award, Blocks, Clock, ListChecks, PencilLine, RotateCcw, Sparkles, Target } from 'lucide-react';
import { MODEL_OPTIONS } from '~shared/models';
import { describePlan, planPractice } from '~shared/practicePlan';
import type { PracticeItem } from '~shared/types';
import { cx, plural } from '../lib/utils';
import { usePreferences } from '../state/PreferencesContext';
import { useStudy } from '../state/StudyContext';
import { Button } from '../components/ui/Button';
import { EmptyState, Notice, ProgressBar, Skeleton, Spinner } from '../components/ui/Feedback';
import { Chip, TINT_CLASS, type Tint } from '../components/ui/Surface';
import { ClozeCard } from '../practice/ClozeCard';
import { MatchGame } from '../practice/MatchGame';
import { QuizCard } from '../practice/QuizCard';

type Filter = 'all' | 'todo' | 'quiz' | 'match' | 'cloze';

const FILTERS: { id: Filter; label: string; tint: Tint }[] = [
  { id: 'all', label: 'All', tint: 'accent' },
  { id: 'todo', label: 'To do', tint: 'indigo' },
  { id: 'quiz', label: 'Quiz', tint: 'violet' },
  { id: 'match', label: 'Match', tint: 'teal' },
  { id: 'cloze', label: 'Blanks', tint: 'amber' },
];

/** One hue per item type, everywhere the type shows up. */
const KINDS = {
  quiz: { label: 'Multiple choice', tint: 'violet' as Tint, icon: ListChecks },
  match: { label: 'Match the pairs', tint: 'teal' as Tint, icon: Blocks },
  cloze: { label: 'Fill in the blank', tint: 'amber' as Tint, icon: PencilLine },
};

export function PracticePanel({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const { state, actions, needsKey } = useStudy();
  const { prefs } = usePreferences();
  const [filter, setFilter] = useState<Filter>('all');
  const practice = state.practice;
  const running = practice.status === 'running';
  /* What the button is about to do, in requests. Worth saying out loud: a
     five-a-minute model covers the deck in one pass, a lite model in several. */
  const plan = useMemo(() => planPractice(state.totalSlides, prefs.practiceModel), [state.totalSlides, prefs.practiceModel]);
  const modelLabel =
    MODEL_OPTIONS.find((option) => option.id === prefs.practiceModel)?.label ?? prefs.practiceModel;

  const stats = useMemo(() => {
    let answered = 0;
    let quizzes = 0;
    let correct = 0;
    for (const item of practice.items) {
      const answer = practice.answers[item.id];
      if (answer !== undefined) answered += 1;
      if (item.kind === 'quiz') {
        quizzes += 1;
        if (typeof answer === 'number' && answer === item.correctIndex) correct += 1;
      }
    }
    return { answered, quizzes, correct, total: practice.items.length };
  }, [practice.items, practice.answers]);

  const visible = useMemo(() => {
    if (filter === 'all') return practice.items;
    if (filter === 'todo') return practice.items.filter((item) => practice.answers[item.id] === undefined);
    return practice.items.filter((item) => item.kind === filter);
  }, [filter, practice.items, practice.answers]);

  if (practice.items.length === 0) {
    return (
      <div className="scroll-area h-full overflow-y-auto px-4 py-6">
        {practice.error && practice.error.code !== 'cancelled' ? (
          <Notice
            tone="error"
            className="mx-auto mb-4 max-w-[420px]"
            title="Could not build the review set"
            onRetry={
              practice.error.code === 'missing_key' || practice.error.code === 'invalid_key'
                ? onOpenSettings
                : () => void actions.generatePractice()
            }
            retryLabel={
              practice.error.code === 'missing_key' || practice.error.code === 'invalid_key' ? 'Open settings' : 'Try again'
            }
          >
            {practice.error.message}
          </Notice>
        ) : null}

        {running ? (
          <div className="mx-auto max-w-[680px] space-y-3">
            <BuildProgress />
            <Skeleton className="h-32 w-full rounded-[16px]" />
            <Skeleton className="h-24 w-full rounded-[16px]" />
            <Skeleton className="h-28 w-full rounded-[16px]" />
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="quiet" onClick={actions.cancelPractice}>
                Stop
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            className="py-12"
            tint="amber"
            icon={<Target className="h-5 w-5" />}
            title="Review the whole deck"
            description={
              <>
                A mixed set of questions, matching pairs and blanks drawn from all{' '}
                {plural(state.totalSlides, 'slide')}.
                <span className="mt-1.5 block text-ink-3">{describePlan(plan)} Using {modelLabel}.</span>
              </>
            }
            action={
              needsKey ? (
                <Button block variant="primary" onClick={onOpenSettings}>
                  Add your API key
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    block
                    variant="primary"
                    icon={<Sparkles className="h-4 w-4" />}
                    onClick={() => void actions.generatePractice()}
                  >
                    Build my review set
                  </Button>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {(['quiz', 'match', 'cloze'] as const).map((kind) => {
                      const meta = KINDS[kind];
                      const Icon = meta.icon;
                      return (
                        <Chip key={kind} tone={meta.tint}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              )
            }
          />
        )}
      </div>
    );
  }

  const score = stats.quizzes > 0 && stats.answered > 0 ? Math.round((stats.correct / Math.max(1, stats.quizzes)) * 100) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line bg-surface px-4 py-3 sm:px-5">
        <div className="mx-auto max-w-[680px]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-medium text-ink">
                <span>
                  {stats.answered} of {stats.total} done
                </span>
                {score !== null ? (
                  <Chip tone={score >= 80 ? 'good' : score >= 50 ? 'amber' : 'bad'}>
                    <Award className="h-3 w-3" />
                    {stats.correct}/{stats.quizzes} correct
                  </Chip>
                ) : null}
              </p>
              <ProgressBar
                className="mt-1.5 w-[200px] max-w-full"
                value={stats.total ? (stats.answered / stats.total) * 100 : 0}
                label="Review progress"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="quiet"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={actions.resetPractice}
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="mt-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
            {FILTERS.map((option) => {
              const count =
                option.id === 'all'
                  ? practice.items.length
                  : option.id === 'todo'
                    ? practice.items.filter((item) => practice.answers[item.id] === undefined).length
                    : practice.items.filter((item) => item.kind === option.id).length;
              if (count === 0 && option.id !== 'all') return null;
              const selected = filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilter(option.id)}
                  className={cx(
                    'shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                    TINT_CLASS[option.tint],
                    selected ? 'tint-fill' : 'tint-chip opacity-80 hover:opacity-100',
                  )}
                >
                  {option.label}
                  <span className="ml-1 tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {running ? <BuildProgress className="mt-3" compact /> : null}
        </div>
      </header>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto max-w-[680px] space-y-3 pb-16">
          {practice.warning ? (
            <Notice tone="warn" onDismiss={actions.dismissPracticeWarning}>
              {practice.warning}
            </Notice>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              className="py-10"
              title="Nothing left here"
              description="Every item in this filter is done. Try another filter, or add more questions."
            />
          ) : (
            visible.map((item, index) => (
              <PracticeCard key={item.id} item={item} index={index} onJump={actions.goto} />
            ))
          )}

          {practice.error && practice.error.code !== 'cancelled' ? (
            <Notice tone="error" title="Could not add more questions" onRetry={() => void actions.generatePractice({ append: true })}>
              {practice.error.message}
            </Notice>
          ) : null}

          <div className="flex justify-center pt-2">
            {running ? (
              <Button size="sm" variant="quiet" onClick={actions.cancelPractice}>
                Stop generating
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                onClick={() => void actions.generatePractice({ append: true })}
                disabled={needsKey}
              >
                Add more questions
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Honest progress for a run that makes several requests. "Reading slides 11–20"
 * is the difference between waiting and wondering whether it is broken.
 */
function BuildProgress({ className, compact }: { className?: string; compact?: boolean }): React.JSX.Element {
  const { state } = useStudy();
  const progress = state.practice.progress;
  const percent = progress ? (progress.done / progress.total) * 100 : 0;
  const items = state.practice.items.length;
  const waiting = Boolean(progress?.waitingUntil && progress.waitingUntil > Date.now());

  return (
    <div className={cx('rounded-[14px] bg-surface-2 px-3.5 py-2.5', className)}>
      <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
        {waiting ? <Clock className="h-3.5 w-3.5 text-amber" /> : <Spinner className="border-t-violet" />}
        {waiting ? (
          // Being paced is not being stuck, and the difference matters.
          <span>Waiting a moment to stay inside this model’s rate limit</span>
        ) : progress ? (
          <>
            Reading slides {progress.from}–{progress.to}
            {progress.total > 1 ? (
              <span className="text-ink-3">
                · pass {Math.min(progress.done + 1, progress.total)} of {progress.total}
              </span>
            ) : null}
          </>
        ) : (
          'Writing your review set'
        )}
        {items > 0 ? <span className="ml-auto shrink-0 tabular-nums text-ink-3">{items} so far</span> : null}
      </p>
      {!compact ? <ProgressBar className="mt-2" value={percent} label="Building the review set" /> : null}
    </div>
  );
}

function PracticeCard({
  item,
  index,
  onJump,
}: {
  item: PracticeItem;
  index: number;
  onJump: (slide: number) => void;
}): React.JSX.Element {
  const { state, actions } = useStudy();
  const answer = state.practice.answers[item.id];

  if (item.kind === 'quiz') {
    return (
      <QuizCard
        question={item}
        label={`Q${index + 1}`}
        chosen={typeof answer === 'number' ? answer : undefined}
        onChoose={(choice) => actions.answerPractice(item.id, choice)}
        onJump={onJump}
      />
    );
  }

  if (item.kind === 'match') {
    return (
      <MatchGame
        set={item}
        completed={answer === true}
        onComplete={() => actions.answerPractice(item.id, true)}
        onJump={onJump}
      />
    );
  }

  return (
    <ClozeCard
      item={item}
      completed={answer === true}
      onComplete={() => actions.answerPractice(item.id, true)}
      onJump={onJump}
    />
  );
}
