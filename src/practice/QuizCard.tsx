import { ArrowUpRight, Check, X } from 'lucide-react';
import type { QuizQuestion } from '~shared/types';
import { cx } from '../lib/utils';
import { Markdown } from '../components/content/Markdown';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuizCard({
  question,
  chosen,
  onChoose,
  label,
  onJump,
}: {
  question: QuizQuestion;
  chosen: number | undefined;
  onChoose: (index: number) => void;
  label?: string;
  onJump?: (slide: number) => void;
}): React.JSX.Element {
  const answered = chosen !== undefined;
  const correct = answered && chosen === question.correctIndex;

  return (
    <section className="tint-card tint-violet p-4 pl-5">
      <header className="mb-3 flex items-start gap-2.5">
        {label ? (
          <span className="tint-chip mt-px shrink-0 rounded-[7px] px-1.5 py-0.5 text-[11px] font-semibold">
            {label}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 text-[14px] font-medium leading-relaxed text-ink">
          <Markdown>{question.question}</Markdown>
        </div>
        {onJump && question.slide ? (
          <button
            type="button"
            onClick={() => onJump(question.slide)}
            className="shrink-0 rounded-[7px] px-1.5 py-0.5 text-[11px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent-text"
            title={`Go to slide ${question.slide}`}
          >
            Slide {question.slide}
            <ArrowUpRight className="ml-0.5 inline h-3 w-3" />
          </button>
        ) : null}
      </header>

      <div role="radiogroup" aria-label="Answer options" className="space-y-1.5">
        {question.options.map((option, index) => {
          const isChosen = chosen === index;
          const isAnswer = index === question.correctIndex;
          const reveal = answered && isAnswer;
          const wrong = answered && isChosen && !isAnswer;

          return (
            <button
              key={`${question.id}-${index}`}
              type="button"
              role="radio"
              aria-checked={isChosen}
              disabled={answered}
              onClick={() => onChoose(index)}
              className={cx(
                'flex w-full items-start gap-2.5 rounded-[12px] border p-2.5 text-left text-[13.5px] transition-[background-color,border-color,opacity] duration-150',
                reveal
                  ? 'border-good bg-good-soft text-ink'
                  : wrong
                    ? 'border-bad bg-bad-soft text-ink'
                    : answered
                      ? 'border-line bg-surface text-ink-3 opacity-60'
                      : 'border-line bg-surface text-ink hover:border-violet hover:bg-violet-soft',
              )}
            >
              <span
                className={cx(
                  'mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  reveal
                    ? 'bg-good text-white'
                    : wrong
                      ? 'bg-bad text-white'
                      : 'tint-chip',
                )}
              >
                {reveal ? <Check className="h-3 w-3" /> : wrong ? <X className="h-3 w-3" /> : LETTERS[index] ?? index + 1}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">
                <Markdown inline>{option}</Markdown>
              </span>
            </button>
          );
        })}
      </div>

      {answered ? (
        <div
          className={cx(
            'animate-in mt-3 rounded-[12px] p-3',
            correct ? 'bg-good-soft' : 'bg-surface-2',
          )}
        >
          <p className={cx('text-[12px] font-semibold', correct ? 'text-good' : 'text-ink-2')}>
            {correct ? 'Correct' : `Answer: ${LETTERS[question.correctIndex] ?? question.correctIndex + 1}`}
          </p>
          {question.explanation ? (
            <div className="mt-1 text-[13px] leading-relaxed text-ink-2">
              <Markdown>{question.explanation}</Markdown>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
