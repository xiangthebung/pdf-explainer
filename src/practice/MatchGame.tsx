import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { shuffle } from '~shared/normalize';
import type { MatchingSet } from '~shared/types';
import { cx } from '../lib/utils';
import { Markdown } from '../components/content/Markdown';
import { Button } from '../components/ui/Button';

interface Side {
  index: number;
  text: string;
}

/**
 * Tap a term, then tap its definition. Wrong pairs nudge and clear; right pairs
 * lock in. Keyboard users get the same flow because every cell is a button.
 */
export function MatchGame({
  set,
  completed,
  onComplete,
  onJump,
}: {
  set: MatchingSet;
  completed: boolean;
  onComplete: () => void;
  onJump?: (slide: number) => void;
}): React.JSX.Element {
  const concepts = useMemo<Side[]>(
    () => shuffle(set.pairs.map((pair, index) => ({ index, text: pair.concept }))),
    [set],
  );
  const definitions = useMemo<Side[]>(
    () => shuffle(set.pairs.map((pair, index) => ({ index, text: pair.definition }))),
    [set],
  );

  const [matched, setMatched] = useState<number[]>([]);
  const [pickedConcept, setPickedConcept] = useState<number | null>(null);
  const [pickedDefinition, setPickedDefinition] = useState<number | null>(null);
  const [wrong, setWrong] = useState<{ concept: number; definition: number } | null>(null);
  const [misses, setMisses] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only a new puzzle resets the board. Reacting to `completed` would clear the
  // matches and the miss count at the exact moment the game is won.
  useEffect(() => {
    setMatched([]);
    setPickedConcept(null);
    setPickedDefinition(null);
    setWrong(null);
    setMisses(0);
    setRevealed(false);
  }, [set.id]);

  useEffect(() => {
    if (completed) setRevealed(true);
  }, [completed]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const finished = revealed || matched.length === set.pairs.length;

  const attempt = (conceptIndex: number, definitionIndex: number) => {
    if (conceptIndex === definitionIndex) {
      const next = [...matched, conceptIndex];
      setMatched(next);
      setPickedConcept(null);
      setPickedDefinition(null);
      if (next.length === set.pairs.length) onComplete();
      return;
    }
    setWrong({ concept: conceptIndex, definition: definitionIndex });
    setMisses((value) => value + 1);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setWrong(null);
      setPickedConcept(null);
      setPickedDefinition(null);
    }, 620);
  };

  const pickConcept = (index: number) => {
    if (finished || matched.includes(index) || wrong) return;
    if (pickedDefinition !== null) attempt(index, pickedDefinition);
    else setPickedConcept(index === pickedConcept ? null : index);
  };

  const pickDefinition = (index: number) => {
    if (finished || matched.includes(index) || wrong) return;
    if (pickedConcept !== null) attempt(pickedConcept, index);
    else setPickedDefinition(index === pickedDefinition ? null : index);
  };

  const cellClass = (index: number, picked: boolean, isWrong: boolean) =>
    cx(
      'w-full rounded-[12px] border p-2.5 text-left text-[13px] leading-snug transition-[background-color,border-color,opacity] duration-150',
      matched.includes(index) || revealed
        ? 'border-good bg-good-soft text-ink'
        : isWrong
          ? 'animate-nudge border-bad bg-bad-soft text-ink'
          : picked
            ? 'border-teal bg-teal-soft text-ink'
            : 'border-line bg-surface text-ink hover:border-teal/50',
      finished && 'cursor-default',
    );

  return (
    <section className="tint-card tint-teal p-4 pl-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium leading-snug text-ink">{set.title}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {!finished
              ? `${matched.length} of ${set.pairs.length} matched`
              : matched.length === set.pairs.length
                ? `Matched with ${misses === 0 ? 'no' : misses} miss${misses === 1 ? '' : 'es'}`
                : completed
                  ? 'Completed earlier'
                  : 'Answers shown'}
          </p>
        </div>
        {onJump && set.slide ? (
          <button
            type="button"
            onClick={() => onJump(set.slide)}
            className="shrink-0 rounded-[7px] px-1.5 py-0.5 text-[11px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent-text"
          >
            Slide {set.slide}
            <ArrowUpRight className="ml-0.5 inline h-3 w-3" />
          </button>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ul className="space-y-2">
          {concepts.map((item) => (
            <li key={`c-${item.index}`}>
              <button
                type="button"
                onClick={() => pickConcept(item.index)}
                aria-pressed={pickedConcept === item.index}
                className={cellClass(item.index, pickedConcept === item.index, wrong?.concept === item.index)}
              >
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 font-medium">
                    <Markdown inline>{item.text}</Markdown>
                  </span>
                  {matched.includes(item.index) || revealed ? (
                    <Check className="mt-px h-3.5 w-3.5 shrink-0 text-good" />
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <ul className="space-y-2">
          {definitions.map((item) => (
            <li key={`d-${item.index}`}>
              <button
                type="button"
                onClick={() => pickDefinition(item.index)}
                aria-pressed={pickedDefinition === item.index}
                className={cellClass(item.index, pickedDefinition === item.index, wrong?.definition === item.index)}
              >
                <span className="min-w-0 flex-1">
                  <Markdown inline>{item.text}</Markdown>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {revealed && matched.length !== set.pairs.length ? (
        <dl className="animate-in mt-3 space-y-1.5 rounded-[12px] bg-surface-2 p-3 text-[12.5px]">
          {set.pairs.map((pair) => (
            <div key={pair.concept} className="flex gap-2">
              <dt className="min-w-[30%] font-medium text-ink">{pair.concept}</dt>
              <dd className="flex-1 text-ink-2">{pair.definition}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!finished && misses >= 2 ? (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              setRevealed(true);
              onComplete();
            }}
          >
            Show answers
          </Button>
        </div>
      ) : null}
    </section>
  );
}
