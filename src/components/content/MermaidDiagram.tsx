import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { renderMermaid } from '../../lib/mermaid';
import { usePreferences } from '../../state/PreferencesContext';
import { Skeleton } from '../ui/Feedback';

type Status = { phase: 'loading' } | { phase: 'ready'; markup: string } | { phase: 'error'; message: string };

/**
 * Diagram renderer. Mermaid is loaded on demand, re-rendered when the appearance
 * changes, and cancelled if the reader navigates away mid-render.
 */
export function MermaidDiagram({ code, caption }: { code: string; caption?: string }): React.JSX.Element {
  const { theme } = usePreferences();
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setStatus({ phase: 'loading' });

    renderMermaid(code, theme)
      .then((result) => {
        if (active) setStatus({ phase: 'ready', markup: result.markup });
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus({ phase: 'error', message: error instanceof Error ? error.message : 'Could not draw this diagram.' });
        }
      });

    return () => {
      active = false;
    };
  }, [code, theme]);

  // The markup is sanitised in `renderMermaid`; injecting it directly is what
  // keeps the SVG interactive (links, tooltips) without a second parse.
  useEffect(() => {
    if (status.phase !== 'ready' || !hostRef.current) return;
    hostRef.current.innerHTML = status.markup;
    const svg = hostRef.current.querySelector('svg');
    if (svg) {
      svg.classList.add('mermaid-svg');
      if (!svg.getAttribute('aria-label')) svg.setAttribute('aria-label', caption ?? 'Diagram');
    }
    return () => {
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [status, caption]);

  if (status.phase === 'error') {
    return (
      <figure className="figure-frame my-4">
        <figcaption className="border-b border-line px-3.5 py-2 text-[12px] text-ink-2">
          This diagram could not be drawn.
        </figcaption>
        <details className="px-3.5 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-medium text-ink-2">
            <ChevronDown className="h-3.5 w-3.5" />
            Show the diagram source
          </summary>
          <p className="mt-2 text-[12px] text-ink-3">{status.message}</p>
          <pre className="scroll-area mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-[10px] bg-surface-2 p-3 font-mono text-[11.5px] text-ink-2">
            {code}
          </pre>
        </details>
      </figure>
    );
  }

  return (
    <figure className="figure-frame my-4">
      <div className="figure-body" data-fluid="true">
        {status.phase === 'loading' ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div ref={hostRef} className="w-full" />
        )}
      </div>
      {caption ? <figcaption className="border-t border-line px-3.5 py-2 text-[12px] text-ink-3">{caption}</figcaption> : null}
    </figure>
  );
}
