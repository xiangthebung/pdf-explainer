import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { searchDocument, type SearchHit } from '../lib/pdf';
import { cx, plural } from '../lib/utils';
import { useStudy } from '../state/StudyContext';
import { Spinner } from '../components/ui/Feedback';
import { usePdf } from './PdfContext';

/**
 * Find-in-deck, as a palette rather than a dialog.
 *
 * Searching a document is a glance, not a task: you want the slide, not a modal
 * over the slide. So this sits at the top of the window, stays narrow, and moves
 * the deck as you arrow through the results — by the time you press Enter you
 * are already looking at the slide you wanted.
 */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { doc } = usePdf();
  const { state, actions } = useStudy();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  /** Where the reader was before browsing results, so Escape can undo it. */
  const originRef = useRef(state.currentSlide);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    originRef.current = state.currentSlide;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // Only on open: the slide changes as results are browsed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      controllerRef.current?.abort();
      setHits([]);
      setSearching(false);
      setActive(0);
      return;
    }
    if (!doc || query.trim().length < 2) {
      controllerRef.current?.abort();
      setHits([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setHits([]);
    setActive(0);
    setSearching(true);

    // Debounce so every keystroke does not restart a full-deck scan.
    const timer = setTimeout(async () => {
      try {
        for await (const hit of searchDocument(doc, query, controller.signal)) {
          if (controller.signal.aborted) return;
          setHits((current) => [...current, hit]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, doc, query]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const totalMatches = useMemo(() => hits.reduce((sum, hit) => sum + hit.matches, 0), [hits]);

  const show = (index: number) => {
    const hit = hits[index];
    if (!hit) return;
    setActive(index);
    actions.goto(hit.page);
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (hits.length === 0) return;
      const next = event.key === 'ArrowDown' ? active + 1 : active - 1;
      show((next + hits.length) % hits.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (hits[active]) actions.goto(hits[active].page);
      onClose();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      // Browsing results moved the deck; leaving should put it back.
      if (state.currentSlide !== originRef.current) actions.goto(originRef.current);
      onClose();
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search this deck"
        className="animate-pop absolute left-1/2 top-4 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[16px] border border-line bg-elevated shadow-float backdrop-blur-2xl"
      >
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Find a term, formula or name in this deck"
            aria-label="Search text"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            // The card is the focus indicator; an outline inside it just adds noise.
            className="h-7 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink placeholder:text-ink-3 focus:outline-none focus-visible:outline-none"
          />
          {searching ? <Spinner className="h-3.5 w-3.5 shrink-0 border-t-violet" /> : null}
          {query.trim().length >= 2 && !searching ? (
            <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">
              {hits.length === 0 ? 'No matches' : `${totalMatches} on ${plural(hits.length, 'slide')}`}
            </span>
          ) : null}
          <kbd className="hidden shrink-0 rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-sans text-[10.5px] text-ink-3 sm:block">
            Esc
          </kbd>
        </div>

        {hits.length > 0 ? (
          <>
            <div className="h-px bg-line" />
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Matching slides"
              className="scroll-area max-h-[min(48vh,420px)] overflow-y-auto p-1.5"
            >
              {hits.map((hit, index) => (
                <li
                  key={hit.page}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => {
                    actions.goto(hit.page);
                    onClose();
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cx(
                    'cursor-pointer rounded-[10px] px-2.5 py-2 transition-colors',
                    index === active ? 'bg-violet-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cx(
                        'shrink-0 text-[12px] font-semibold tabular-nums',
                        index === active ? 'text-violet' : 'text-ink-2',
                      )}
                    >
                      Slide {hit.page}
                    </span>
                    {hit.matches > 1 ? (
                      <span className="shrink-0 text-[11px] text-ink-3">{hit.matches} matches</span>
                    ) : null}
                    {index === active ? (
                      <span className="ml-auto hidden shrink-0 items-center gap-1 text-[11px] text-ink-3 sm:flex">
                        <CornerDownLeft className="h-3 w-3" /> Go
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">
                    <Highlight text={hit.snippet} term={query.trim()} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[11px] text-ink-3">
              <span>↑ ↓ to preview</span>
              <span>Enter to stay</span>
              <span className="ml-auto">Esc puts you back on slide {originRef.current}</span>
            </div>
          </>
        ) : query.trim().length >= 2 && !searching ? (
          <>
            <div className="h-px bg-line" />
            <p className="px-3.5 py-3 text-[12.5px] text-ink-2">
              Nothing in this deck matches “{query.trim()}”. Scanned slides with no text layer cannot be searched.
            </p>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Marks the matched term inside a snippet without trusting the input as HTML. */
function Highlight({ text, term }: { text: string; term: string }): React.JSX.Element {
  if (term.length < 2) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const needle = term.toLowerCase();
  const haystack = text.toLowerCase();
  let cursor = 0;
  let index = haystack.indexOf(needle);

  while (index !== -1 && parts.length < 40) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark key={`${index}`} className="rounded-[3px] bg-amber-soft px-0.5 text-ink">
        {text.slice(index, index + term.length)}
      </mark>,
    );
    cursor = index + term.length;
    index = haystack.indexOf(needle, cursor);
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
