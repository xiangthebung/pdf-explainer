import { useEffect, useState } from 'react';
import { Sigma } from 'lucide-react';
import type { WorkedExample } from '~shared/types';
import { Markdown } from '../components/content/Markdown';
import { Button } from '../components/ui/Button';

/**
 * Steps are revealed one at a time so the reader gets a chance to try the next
 * move themselves. The final answer stays hidden until the working is done.
 */
export function WorkedExampleCard({ example, slide }: { example: WorkedExample; slide: number }): React.JSX.Element {
  const [shown, setShown] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    setShown(0);
    setShowAnswer(false);
  }, [slide, example.problem]);

  const allShown = shown >= example.steps.length;

  return (
    <section className="tint-card tint-indigo p-4 pl-5">
      <header className="mb-2.5 flex items-center gap-2">
        <span className="tint-chip flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px]">
          <Sigma className="h-3 w-3" />
        </span>
        <h3 className="tint-text text-[12px] font-semibold uppercase tracking-[0.05em]">Work it through</h3>
      </header>

      <div className="text-[14px] leading-relaxed text-ink">
        <Markdown>{example.problem}</Markdown>
      </div>

      {shown > 0 ? (
        <ol className="mt-4 space-y-3 border-l border-line pl-4">
          {example.steps.slice(0, shown).map((step, index) => (
            <li key={index} className="animate-in relative text-[13.5px] leading-relaxed text-ink-2">
              <span className="tint-fill absolute -left-[21px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold">
                {index + 1}
              </span>
              <Markdown>{step}</Markdown>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!allShown ? (
          <Button size="sm" variant="secondary" onClick={() => setShown((value) => value + 1)}>
            {shown === 0 ? 'Show the first step' : `Show step ${shown + 1}`}
          </Button>
        ) : null}
        {allShown && !showAnswer && example.answer ? (
          <Button size="sm" variant="primary" onClick={() => setShowAnswer(true)}>
            Reveal the answer
          </Button>
        ) : null}
        {!allShown && example.steps.length > 1 ? (
          <Button size="sm" variant="quiet" onClick={() => setShown(example.steps.length)}>
            Show all steps
          </Button>
        ) : null}
      </div>

      {showAnswer && example.answer ? (
        <div className="animate-in mt-3 rounded-[12px] bg-good-soft p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-good">Answer</p>
          <div className="mt-1 text-[14px] text-ink">
            <Markdown>{example.answer}</Markdown>
          </div>
        </div>
      ) : null}
    </section>
  );
}
