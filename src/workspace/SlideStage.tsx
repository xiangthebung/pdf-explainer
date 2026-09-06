import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MessageCircleQuestion,
  PanelRightOpen,
  RefreshCw,
  ScanLine,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fitPage, getPageText, renderPageToCanvas, renderTextLayer, type RenderHandle } from '../lib/pdf';
import { useShortcuts } from '../hooks/useKeyboard';
import { clamp, cx } from '../lib/utils';
import { useStudy } from '../state/StudyContext';
import { IconButton } from '../components/ui/Button';
import { EmptyState, Skeleton, Spinner } from '../components/ui/Feedback';
import { LayoutMenu, type Layout } from './LayoutMenu';
import { usePdf } from './PdfContext';
import { placeChip, readSelection, type ChipPlacement } from './selection';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/** The chip's footprint, for placing it before it has been measured. */
const CHIP_SIZE = { width: 136, height: 32 };

interface SelectionChip extends ChipPlacement {
  text: string;
}

export function SlideStage({
  onOpenSearch,
  onAskAbout,
  layout,
  onLayoutChange,
  restoreLayout = 'split',
  showNotesLayouts = true,
  filmstrip,
  rightInset,
  children,
}: {
  onOpenSearch: () => void;
  /** Highlighted text on the slide, handed to the tutor. Without it there is no chip. */
  onAskAbout?: (selection: string) => void;
  /** Where the notes live. `slide` means the slide has the window to itself. */
  layout: Layout;
  onLayoutChange: (next: Layout) => void;
  /** The notes layout to come back to when leaving `slide`. */
  restoreLayout?: Layout;
  /** False on a phone, where the notes get their own tab instead. */
  showNotesLayouts?: boolean;
  filmstrip: { open: boolean; onToggle: () => void };
  /** Space to leave on the right for a floating panel, in pixels. */
  rightInset?: number;
  /**
   * Floating layers that belong to the slide — the notes overlay lives here so
   * that it comes along into browser full screen instead of vanishing.
   */
  children?: ReactNode;
}): React.JSX.Element {
  const { doc, status, error, reload } = usePdf();
  const { state, actions } = useStudy();
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [pageInput, setPageInput] = useState(String(state.currentSlide));
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** The slide has the window to itself. */
  const focus = layout === 'slide';

  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const renderRef = useRef<RenderHandle | null>(null);
  const textRenderRef = useRef<RenderHandle | null>(null);

  /* True full screen, for when even focus mode is not enough room. */
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void stageRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => setPageInput(String(state.currentSlide)), [state.currentSlide]);

  /* Measure the available area; debounced so dragging the divider stays smooth. */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setBox({ width: rect.width, height: rect.height }), 90);
    });
    observer.observe(node);
    const rect = node.getBoundingClientRect();
    setBox({ width: rect.width, height: rect.height });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  /*
   * Render the current page: the picture into the canvas and, over it, the text
   * layer that makes the slide selectable. Every path cancels both previous
   * tasks first, so flicking through slides never leaves a late render landing
   * on the wrong page.
   */
  useEffect(() => {
    if (!doc || !box || box.width < 40) return;
    let cancelled = false;
    setRendering(true);

    const run = async () => {
      const pageNumber = clamp(state.currentSlide, 1, doc.numPages);
      const page = await doc.getPage(pageNumber);
      if (cancelled) {
        page.cleanup();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Focus mode trims the padding too: every pixel goes to the slide.
      const gutter = focus ? 12 : 24;
      const fit = fitPage(page, { width: box.width - gutter, height: box.height - gutter }, zoom);
      renderRef.current?.cancel();
      textRenderRef.current?.cancel();
      const handle = renderPageToCanvas(page, canvas, { scale: fit.scale });
      renderRef.current = handle;
      const layer = textLayerRef.current;
      const text = layer ? renderTextLayer(page, layer, fit.scale) : null;
      textRenderRef.current = text;
      try {
        await Promise.all([handle.done, text?.done]);
      } finally {
        if (renderRef.current === handle) renderRef.current = null;
        if (textRenderRef.current === text) textRenderRef.current = null;
        page.cleanup();
        if (!cancelled) setRendering(false);
      }
    };

    void run().catch(() => {
      if (!cancelled) setRendering(false);
    });

    return () => {
      cancelled = true;
      renderRef.current?.cancel();
      renderRef.current = null;
      textRenderRef.current?.cancel();
      textRenderRef.current = null;
    };
  }, [doc, box, zoom, focus, state.currentSlide]);

  useEffect(
    () => () => {
      renderRef.current?.cancel();
      textRenderRef.current?.cancel();
    },
    [],
  );

  /*
   * Select-to-ask.
   *
   * Highlight a phrase on the slide and a chip appears over it offering to ask
   * the tutor. The selection is read from the document rather than tracked by
   * hand, so a keyboard selection counts as much as a drag; the chip waits until
   * the pointer is up, because a chip that chases a drag is a chip you cannot
   * catch. It goes away when the selection does, and when the slide does.
   */
  const [chip, setChip] = useState<SelectionChip | null>(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    if (!onAskAbout) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      timer = null;
      const stage = stageRef.current;
      const selection = document.getSelection();
      const text = readSelection(selection, textLayerRef.current);
      if (!text || !stage || !selection || selectingRef.current) {
        setChip(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setChip(null);
        return;
      }
      setChip({ text, ...placeChip(rect, stage.getBoundingClientRect(), CHIP_SIZE) });
    };
    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(update, delay);
    };

    const onSelectionChange = () => schedule(180);
    const onPointerDown = (event: PointerEvent) => {
      if (textLayerRef.current?.contains(event.target as Node)) selectingRef.current = true;
    };
    const onPointerUp = () => {
      selectingRef.current = false;
      schedule(0);
    };
    const onScroll = () => schedule(0);

    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    const scroller = scrollRef.current;
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      scroller?.removeEventListener('scroll', onScroll);
    };
  }, [onAskAbout]);

  useEffect(() => setChip(null), [state.currentSlide, zoom]);

  const askAboutSelection = () => {
    if (!chip || !onAskAbout) return;
    const text = chip.text;
    setChip(null);
    document.getSelection()?.removeAllRanges();
    onAskAbout(text);
  };

  /*
   * The current slide's text, for two things that both needed it.
   *
   * A rasterised page is `role="img"` with a label that says "Slide 3 of 20", so
   * a screen reader was told where it was and nothing about what was on it — the
   * whole deck was unreadable. The extraction already existed for chat and
   * search; putting it in a visually-hidden node next to the canvas gives the
   * page a description rather than a position. The selectable text layer is
   * hidden from assistive tech for the same reason: it is the same words, in
   * paint order, and hearing them twice is worse than once.
   *
   * The empty case is the other half. A scanned deck has no text layer, and the
   * app knew that, told the model about it, and told the user only if they
   * happened to run a search that found nothing. It is worth saying plainly:
   * it explains why search misses the slide and why the tutor is vague about it.
   *
   * `null` is "not read yet" and distinct from `''`, "read, and there is none" —
   * without that the notice flashes on every slide change before the text lands.
   * Results are cached per page by `getPageText`, so revisiting a slide is free.
   */
  const [pageText, setPageText] = useState<string | null>(null);
  const slideTextId = useId();

  useEffect(() => {
    if (!doc) {
      setPageText(null);
      return;
    }
    let cancelled = false;
    setPageText(null);
    void getPageText(doc, clamp(state.currentSlide, 1, doc.numPages))
      .then((text) => {
        if (!cancelled) setPageText(text);
      })
      .catch(() => {
        if (!cancelled) setPageText('');
      });
    return () => {
      cancelled = true;
    };
  }, [doc, state.currentSlide]);

  const hasText = pageText !== null && pageText.trim().length > 0;
  const textLayerMissing = pageText !== null && pageText.trim().length === 0;

  /* Zoom lives here, so its shortcuts do too. */
  const nudgeZoom = useCallback((delta: number) => {
    setZoom((value) => clamp(Number((value + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  }, []);

  useShortcuts({
    '+': () => nudgeZoom(0.2),
    '=': () => nudgeZoom(0.2),
    '-': () => nudgeZoom(-0.2),
    '0': () => setZoom(1),
    // Shift+F, next to F for thumbnails. Full screen belongs to whoever owns
    // the element that goes full screen, which is this component.
    F: toggleFullscreen,
  });

  const commitPage = useCallback(() => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) actions.goto(parsed);
    else setPageInput(String(state.currentSlide));
  }, [pageInput, actions, state.currentSlide]);

  /* Swipe between slides on touch devices. A drag that selected text was a selection, not a swipe. */
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (touch && event.touches.length === 1) touchRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || zoom > 1.05) return;
    if (document.getSelection()?.isCollapsed === false) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    actions.step(dx < 0 ? 1 : -1);
  };

  const total = doc?.numPages ?? state.totalSlides;
  const atStart = state.currentSlide <= 1;
  const atEnd = state.currentSlide >= total;

  return (
    <div ref={stageRef} className="relative flex h-full min-h-0 flex-col bg-canvas">
      <div
        ref={scrollRef}
        className={cx('scroll-area group relative flex-1 overflow-auto', focus ? 'p-1.5' : 'p-3')}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onDoubleClick={showNotesLayouts ? () => onLayoutChange(focus ? restoreLayout : 'slide') : undefined}
        title={
          showNotesLayouts
            ? focus
              ? 'Double-click to bring the notes back'
              : 'Double-click to show the slide on its own'
            : undefined
        }
      >
        {status === 'error' ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="This deck will not open"
              description={error ?? 'The file may be corrupted or password protected.'}
              action={
                <button
                  type="button"
                  onClick={reload}
                  className="mx-auto inline-flex items-center gap-2 rounded-[11px] bg-surface px-4 py-2 text-[13px] font-medium text-ink shadow-soft"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              }
            />
          </div>
        ) : status === 'loading' ? (
          <div className="flex h-full items-center justify-center">
            <Skeleton className="aspect-[16/9] w-full max-w-3xl" />
          </div>
        ) : (
          <div className="flex min-h-full min-w-full items-center justify-center">
            <div className="relative overflow-hidden rounded-[10px] bg-white shadow-card ring-1 ring-black/5">
              <canvas
                ref={canvasRef}
                className="block"
                aria-label={`Slide ${state.currentSlide} of ${total}`}
                aria-describedby={slideTextId}
                role="img"
              />
              {/* The selectable words, laid over the picture of them. Double-clicking
                  a word selects it, and must not also flip the layout — which is what
                  a double-click anywhere else on the slide still means, including the
                  empty parts of this layer. */}
              <div
                ref={textLayerRef}
                className="textLayer"
                aria-hidden="true"
                onDoubleClick={(event) => {
                  if (event.target !== event.currentTarget) event.stopPropagation();
                }}
              />
              {/* What the canvas actually says, for anyone who cannot see it. */}
              <div id={slideTextId} className="sr-only">
                {hasText
                  ? pageText
                  : textLayerMissing
                    ? 'This slide has no text layer. It is a scanned or exported image, so its words cannot be read out.'
                    : 'Reading the text of this slide.'}
              </div>
            </div>
          </div>
        )}

        {/* Says why search will miss this slide and why the tutor has less to go on. */}
        {status === 'ready' && textLayerMissing ? (
          <div
            className="pointer-events-none absolute top-4 left-4 flex items-center gap-1.5 rounded-full border border-line bg-elevated/90 px-2.5 py-1 text-[11px] text-ink-2 shadow-soft backdrop-blur"
            title="Nothing on this slide can be searched, and the tutor sees only the picture."
          >
            <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
            No text layer on this slide
          </div>
        ) : null}

        {/* Hover targets for mouse users; the controls below cover everyone else. */}
        {status === 'ready' && !atStart ? (
          <button
            type="button"
            onClick={() => actions.step(-1)}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-elevated text-ink opacity-0 shadow-soft backdrop-blur transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {status === 'ready' && !atEnd ? (
          <button
            type="button"
            onClick={() => actions.step(1)}
            aria-label="Next slide"
            style={rightInset ? { right: `${rightInset}px` } : undefined}
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-elevated text-ink opacity-0 shadow-soft backdrop-blur transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}

        {rendering && status === 'ready' ? (
          <div
            className="pointer-events-none absolute top-4"
            style={{ right: rightInset ? `${rightInset + 8}px` : '1rem' }}
          >
            <Spinner label="Rendering slide" />
          </div>
        ) : null}
      </div>

      {/* The select-to-ask chip. Pressing it must not clear the selection it is
          about, which a mousedown on a button would otherwise do. */}
      {chip && onAskAbout ? (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: `${chip.x}px`, top: `${chip.y}px`, transform: 'translateX(-50%)' }}
        >
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={askAboutSelection}
            title="Ask the tutor about the highlighted text"
            className="animate-pop pointer-events-auto inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3 text-[12.5px] font-medium text-bg shadow-float transition-transform hover:-translate-y-px"
          >
            <MessageCircleQuestion className="h-3.5 w-3.5 text-cyan" />
            Ask about this
          </button>
        </div>
      ) : null}

      {children}

      {/* Floating control bar. Above the slide and its text layer, which is what the
          z-index is for: in "slide only" the page reaches under the bar. */}
      <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-line bg-elevated px-1.5 py-1 shadow-card backdrop-blur-xl">
          <IconButton label="Previous slide" size="sm" onClick={() => actions.step(-1)} disabled={atStart}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <div className="flex items-center gap-1 px-1 text-[12px] tabular-nums text-ink-2">
            <label className="sr-only" htmlFor="stage-page">
              Slide number
            </label>
            <input
              id="stage-page"
              value={pageInput}
              inputMode="numeric"
              onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))}
              onBlur={commitPage}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitPage();
                  event.currentTarget.blur();
                }
              }}
              className="h-6 w-9 rounded-[7px] bg-surface-2 text-center text-[12px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent-soft"
            />
            <span className="select-none">/ {total || '–'}</span>
          </div>
          <IconButton label="Next slide" size="sm" onClick={() => actions.step(1)} disabled={atEnd}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>

          <span className="mx-1 h-5 w-px bg-line" />

          <IconButton
            label="Zoom out"
            size="sm"
            onClick={() => nudgeZoom(-0.2)}
            disabled={zoom <= MIN_ZOOM}
          >
            <ZoomOut className="h-4 w-4" />
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className={cx(
              'h-7 min-w-[46px] rounded-[8px] px-1.5 text-[12px] font-medium tabular-nums transition-colors',
              zoom === 1 ? 'text-ink-2 hover:bg-surface-2' : 'bg-accent-soft text-accent-text',
            )}
            title="Fit to window"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton
            label="Zoom in"
            size="sm"
            onClick={() => nudgeZoom(0.2)}
            disabled={zoom >= MAX_ZOOM}
          >
            <ZoomIn className="h-4 w-4" />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-line" />

          <button
            type="button"
            onClick={onOpenSearch}
            title="Search this deck (/)"
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
          </button>

          {focus && showNotesLayouts ? (
            // The way out of "slide only" has to be obvious, and it has to say
            // where it is taking you.
            <button
              type="button"
              onClick={() => onLayoutChange(restoreLayout)}
              title={
                restoreLayout === 'overlay'
                  ? 'Bring the notes back, floating over the slide'
                  : 'Bring the notes back, beside the slide'
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              Show notes
            </button>
          ) : null}

          <LayoutMenu
            layout={layout}
            onLayoutChange={onLayoutChange}
            showNotesLayouts={showNotesLayouts}
            filmstripOpen={filmstrip.open}
            onToggleFilmstrip={filmstrip.onToggle}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>
    </div>
  );
}
