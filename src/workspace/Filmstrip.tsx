import { useEffect, useRef, useState } from 'react';
import { Check, PanelLeftClose } from 'lucide-react';
import { getThumbnail } from '../lib/pdf';
import { cx } from '../lib/utils';
import { slideProgress } from '../state/reducer';
import { useStudy } from '../state/StudyContext';
import { IconButton } from '../components/ui/Button';
import { usePdf } from './PdfContext';

/**
 * Slide thumbnails. Renders every page but only rasterises the ones near the
 * viewport, so a 300-slide deck costs no more than a 10-slide one on open.
 */
export function Filmstrip({
  orientation,
  onCollapse,
}: {
  orientation: 'vertical' | 'horizontal';
  /** Renders a hide control on the strip itself, where people look for it. */
  onCollapse?: () => void;
}): React.JSX.Element {
  const { state, actions } = useStudy();
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const vertical = orientation === 'vertical';

  /* Keep the current slide in view, and let keyboard focus follow it. */
  useEffect(() => {
    const node = activeRef.current;
    if (!node) return;
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== node && listRef.current?.contains(focused)) node.focus();
  }, [state.currentSlide]);

  /**
   * A tab list owns its arrow keys, so it moves the slide itself rather than
   * letting the global shortcut fire as well — otherwise one press moved two
   * things.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const forward = vertical ? 'ArrowDown' : 'ArrowRight';
    const back = vertical ? 'ArrowUp' : 'ArrowLeft';
    let next: number | null = null;
    if (event.key === forward) next = state.currentSlide + 1;
    else if (event.key === back) next = state.currentSlide - 1;
    else if (event.key === 'Home') next = 1;
    else if (event.key === 'End') next = state.totalSlides;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    actions.goto(next);
  };

  const pages = Array.from({ length: Math.max(0, state.totalSlides) }, (_, index) => index + 1);
  const explained = pages.filter((page) => slideProgress(state, page).explained).length;

  const list = (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Slides"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      onKeyDown={onKeyDown}
      className={cx(
        'scroll-area',
        vertical
          ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5'
          : 'flex w-full gap-2 overflow-x-auto border-t border-line p-2.5',
      )}
    >
      {pages.map((page) => {
        const progress = slideProgress(state, page);
        const active = page === state.currentSlide;
        const complete = progress.practiceTotal > 0 && progress.practiceDone === progress.practiceTotal;
        return (
          <button
            key={page}
            ref={active ? activeRef : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            aria-label={`Slide ${page}${progress.explained ? ', explained' : ''}${complete ? ', practice complete' : ''}`}
            onClick={() => actions.goto(page)}
            className={cx(
              'group relative shrink-0 overflow-hidden rounded-[10px] border text-left transition-[border-color,box-shadow,transform] duration-150',
              vertical ? 'w-full' : 'w-[132px]',
              active
                ? 'border-violet ring-2 ring-violet-soft'
                : progress.explained
                  ? 'border-violet/25 hover:border-violet/60 hover:-translate-y-px'
                  : 'border-line hover:border-line-strong hover:-translate-y-px',
            )}
          >
            <Thumbnail page={page} />
            <span className="absolute left-1 top-1 rounded-[6px] bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
              {page}
            </span>
            {progress.explained ? (
              <span
                className={cx(
                  'absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-white shadow-soft',
                  complete ? 'bg-good' : 'bg-violet',
                )}
                title={complete ? 'Explained and practised' : 'Explained'}
              >
                {complete ? <Check className="h-2.5 w-2.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  if (!vertical) return list;

  return (
    <div className="flex h-full w-[176px] shrink-0 flex-col border-r border-line bg-bg">
      <div className="flex items-center justify-between gap-1 py-1.5 pl-3 pr-1.5">
        <span className="flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Slides
          {explained > 0 ? (
            <span
              className="rounded-full bg-violet-soft px-1.5 py-px text-[10px] font-semibold tabular-nums text-violet"
              title={`${explained} of ${pages.length} slides explained`}
            >
              {explained}/{pages.length}
            </span>
          ) : null}
        </span>
        {onCollapse ? (
          <IconButton label="Hide thumbnails" size="sm" onClick={onCollapse}>
            <PanelLeftClose className="h-4 w-4" />
          </IconButton>
        ) : null}
      </div>
      {list}
    </div>
  );
}

function Thumbnail({ page }: { page: number }): React.JSX.Element {
  const { doc } = usePdf();
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !doc) return;
    let cancelled = false;

    const load = () => {
      getThumbnail(doc, page)
        .then((next) => {
          if (!cancelled) setUrl(next);
        })
        .catch(() => {
          /* a thumbnail is decoration; failing silently is correct here */
        });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '320px' },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [doc, page]);

  return (
    <div ref={ref} className="aspect-[16/9] w-full bg-surface-2">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" loading="lazy" decoding="async" />
      ) : (
        <div className="skeleton h-full w-full" />
      )}
    </div>
  );
}
