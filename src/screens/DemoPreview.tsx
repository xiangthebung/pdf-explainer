import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { normalizeExplainBatch } from '~shared/normalize';
import { DEMO_RAW_RESPONSE, DEMO_TOTAL_SLIDES } from '../demo/demoDeck';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Surface';
import { Block } from '../workspace/NoteBlocks';

/**
 * A real note, on the landing page, for someone who has no key yet.
 *
 * The key wall is honest and it is also the first thing a new visitor meets:
 * nothing but the demo works without a Gemini key, and the page said so
 * without showing what the key buys. This is what it buys — one slide of the
 * demo lecture, through the same normaliser and the same renderer as a live
 * response, so the maths, the callout and the tone are the real ones.
 *
 * Slide two rather than one: the title slide's note opens with a diagram, and
 * a diagram loads Mermaid, which the landing page has no other reason to carry.
 *
 * Loaded lazily by the upload screen, because the Markdown stack and the demo
 * deck are not something the upload screen needs to paint.
 */
const PREVIEW_SLIDE = 2;

export default function DemoPreview({ onOpenDemo }: { onOpenDemo: () => void }): React.JSX.Element | null {
  const note = useMemo(() => {
    const batch = normalizeExplainBatch(DEMO_RAW_RESPONSE, { requestedFrom: 1, totalSlides: DEMO_TOTAL_SLIDES });
    return batch.notes.find((entry) => entry.slide === PREVIEW_SLIDE) ?? batch.notes[0] ?? null;
  }, []);
  if (!note) return null;

  const prose = note.blocks.filter((block) => block.type === 'markdown').slice(0, 1);
  const callout = note.blocks.find((block) => block.type === 'callout');
  const practice = note.quiz.length + note.matching.length + note.cloze.length;

  return (
    <section className="mt-7" aria-label="What the notes look like">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        What you get for every slide
      </p>
      <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
        <div className="px-5 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="violet">Slide {note.slide}</Chip>
            <Chip tone="indigo">Demo lecture</Chip>
            <span className="text-[11.5px] text-ink-3">Written by Gemini, through the same pipeline as your deck</span>
          </div>
          {note.summary ? (
            <h3 className="mt-2.5 text-[18px] font-semibold leading-tight tracking-[-0.02em] text-ink">{note.summary}</h3>
          ) : null}
        </div>

        {/* The prose is clipped and faded rather than cut: the point is the
            look of a note, not the whole of one. The callout below the fade
            is complete, so the colour system is seen doing its job. */}
        <div className="relative mt-3 max-h-[168px] overflow-hidden px-5">
          <div className="space-y-4">
            {prose.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
        </div>

        {callout ? (
          <div className="px-5 pt-2">
            <Block block={callout} />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <p className="text-[12.5px] text-ink-3">
            {practice > 0
              ? `${practice} practice item${practice === 1 ? '' : 's'} follow this slide${note.worked ? ', plus a worked example' : ''}.`
              : 'Practice items follow every teaching slide.'}
          </p>
          <Button size="sm" variant="secondary" trailing={<ArrowRight className="h-3.5 w-3.5" />} onClick={onOpenDemo}>
            Read the whole demo lecture
          </Button>
        </div>
      </div>
    </section>
  );
}
