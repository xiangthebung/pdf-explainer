import { useMemo } from 'react';
import { sanitizeSvg } from '../../lib/sanitizeSvg';

/**
 * Inline vector figure from model output. The markup is sanitised to an allowlist
 * (no scripts, no external references, no foreign objects) and the root is made
 * responsive so it scales with the panel instead of overflowing it.
 */
export function SvgFigure({ code, caption }: { code: string; caption?: string }): React.JSX.Element {
  const sanitized = useMemo(() => sanitizeSvg(code), [code]);

  if (!sanitized) {
    return (
      <figure className="figure-frame my-4">
        <figcaption className="border-b border-line px-3.5 py-2 text-[12px] text-ink-2">
          This figure could not be displayed safely.
        </figcaption>
        <pre className="scroll-area max-h-48 overflow-auto whitespace-pre-wrap rounded-b-[15px] bg-surface-2 p-3 font-mono text-[11.5px] text-ink-3">
          {code.slice(0, 1200)}
        </pre>
      </figure>
    );
  }

  return (
    <figure className="figure-frame my-4">
      <div
        className="figure-body [&_svg]:max-h-[min(58vh,460px)] [&_svg]:w-full [&_svg]:text-accent"
        // Sanitised above: allowlisted tags and attributes only.
        dangerouslySetInnerHTML={{ __html: sanitized.markup }}
      />
      {caption ? <figcaption className="border-t border-line px-3.5 py-2 text-[12px] text-ink-3">{caption}</figcaption> : null}
    </figure>
  );
}
