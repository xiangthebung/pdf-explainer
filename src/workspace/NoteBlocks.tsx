import { Brain, Compass, Eye, KeyRound, Lightbulb, Route, TriangleAlert } from 'lucide-react';
import type { CalloutKind, ContentBlock } from '~shared/types';
import { cx } from '../lib/utils';
import { Markdown } from '../components/content/Markdown';
import { TINT_CLASS, type Tint } from '../components/ui/Surface';

/**
 * Each callout keeps one hue for the whole app. Skimming a long note, the
 * colours tell you what kind of thing you are about to read before you read a
 * word of it — which is most of the value of having callouts at all.
 *
 * Shared between the notes panel and the landing page's preview of a note, so
 * the preview is drawn by the same code as the real thing.
 */
export const CALLOUTS: Record<CalloutKind, { label: string; icon: typeof Lightbulb; tint: Tint }> = {
  concept: { label: 'Key concept', icon: KeyRound, tint: 'violet' },
  intuition: { label: 'Intuition', icon: Lightbulb, tint: 'amber' },
  memory: { label: 'Memory hook', icon: Brain, tint: 'pink' },
  example: { label: 'In the real world', icon: Compass, tint: 'teal' },
  walkthrough: { label: 'Walkthrough', icon: Route, tint: 'indigo' },
  watchout: { label: 'Watch out', icon: TriangleAlert, tint: 'bad' },
};

function CalloutLabel({ icon: Icon, label }: { icon: typeof Lightbulb; label: string }): React.JSX.Element {
  return (
    <>
      <span className="tint-chip flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px]">
        <Icon className="h-3 w-3" />
      </span>
      <span className="tint-text text-[12px] font-semibold uppercase tracking-[0.05em]">{label}</span>
    </>
  );
}

export function Block({ block }: { block: ContentBlock }): React.JSX.Element {
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
