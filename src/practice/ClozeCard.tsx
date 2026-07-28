import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CornerDownLeft, Eye, Lightbulb, PencilLine } from 'lucide-react';
import type { ClozeItem } from '~shared/types';
import { cx } from '../lib/utils';
import { Markdown } from '../components/content/Markdown';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Surface';
import { answerHint, checkAnswer, maskAnswer, type AnswerVerdict } from './answerCheck';

/**
 * Typed recall, with a way out at every step.
 *
 * Retrieval is the point, so the answer starts hidden — but a blank you cannot
 * guess is just a wall. The answer is always one visible tap away (the button,
 * or the blank itself), and a wrong attempt earns the shape of the answer
 * rather than another "not quite".
 */
export function ClozeCard({
  item,
  completed,
  onComplete,
  onJump,
}: {
  item: ClozeItem;
  completed: boolean;
  onComplete: () => void;
  onJump?: (slide: number) => void;
}): React.JSX.Element {
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [revealed, setRevealed] = useState(false);
  /** Already finished before this card was mounted, i.e. on an earlier visit. */
  const [arrivedDone, setArrivedDone] = useState(completed);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset only when the exercise itself changes. Reacting to `completed` here
  // would wipe the verdict the moment a correct answer is recorded, and the
  // student would be told the answer was "shown" rather than earned.
  useEffect(() => {
    setValue('');
    setVerdict(null);
    setAttempts(0);
    setRevealed(false);
    setArrivedDone(completed);
    // `completed` is read deliberately as it stands when the item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    if (completed) setRevealed(true);
  }, [completed]);

  const solved = revealed || verdict === 'correct';
  const showHint = !solved && attempts > 0;

  const submit = () => {
    if (!value.trim() || solved) return;
    const result = checkAnswer(value, item.answer);
    setVerdict(result);
    if (result === 'correct') {
      setRevealed(true);
      onComplete();
      return;
    }
    setAttempts((count) => count + 1);
  };

  const reveal = () => {
    setRevealed(true);
    onComplete();
    inputRef.current?.blur();
  };

  return (
    <section className="tint-card tint-amber p-4 pl-5">
      <header className="mb-2.5 flex items-center gap-2">
        <Chip tone="amber">
          <PencilLine className="h-3 w-3" />
          Fill in the blank
        </Chip>
        {onJump && item.slide ? (
          <button
            type="button"
            onClick={() => onJump(item.slide)}
            className="ml-auto shrink-0 rounded-[7px] px-1.5 py-0.5 text-[11px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Slide {item.slide}
            <ArrowUpRight className="ml-0.5 inline h-3 w-3" />
          </button>
        ) : null}
      </header>

      <p className="text-[15px] leading-[2] text-ink">
        <span className="align-middle">
          <Markdown inline>{item.before}</Markdown>
        </span>
        {solved ? (
          <span className="animate-pop mx-1.5 inline-flex min-w-[92px] items-center justify-center rounded-[8px] bg-good-soft px-2 py-0.5 align-middle text-[13.5px] font-semibold text-good">
            {item.answer}
          </span>
        ) : (
          // The blank itself is the reveal control: the most obvious thing to
          // press when you are stuck is the thing you are stuck on.
          <button
            type="button"
            onClick={reveal}
            title="Show the answer"
            aria-label="Show the answer"
            className="tint-amber mx-1.5 inline-flex min-w-[104px] items-center justify-center rounded-[8px] border border-dashed px-2 py-0.5 align-middle text-[13px] font-medium tracking-[0.14em] tint-ring tint-text hover:bg-amber-soft"
          >
            {showHint ? maskAnswer(item.answer) : '?????'}
          </button>
        )}
        <span className="align-middle">
          <Markdown inline>{item.after}</Markdown>
        </span>
      </p>

      {solved ? (
        <p className="animate-in mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-good">
          <Check className="h-3.5 w-3.5" />
          {verdict === 'correct' ? 'That is it' : arrivedDone ? 'Answered earlier' : 'Answer shown'}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (verdict) setVerdict(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder="Type the missing term"
                aria-label="Your answer"
                aria-invalid={verdict === 'wrong'}
                className={cx(
                  'h-9 w-full rounded-[11px] border bg-surface px-3 pr-9 text-[13.5px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-[3px]',
                  verdict === 'wrong'
                    ? 'border-bad focus:border-bad focus:ring-bad-soft'
                    : verdict === 'close'
                      ? 'border-warn focus:border-warn focus:ring-warn-soft'
                      : 'border-line focus:border-accent focus:ring-accent-soft',
                )}
              />
              <CornerDownLeft className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            </div>
            <Button size="sm" variant="secondary" onClick={submit} disabled={!value.trim()}>
              Check
            </Button>
            {/* Never buried behind two wrong guesses. */}
            <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={reveal}>
              Show answer
            </Button>
          </div>

          {showHint ? (
            <p className="animate-in mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <Lightbulb className="h-3.5 w-3.5 text-amber" />
              {verdict === 'close' ? 'Close — you have part of it. ' : ''}
              Hint: {answerHint(item.answer)}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
