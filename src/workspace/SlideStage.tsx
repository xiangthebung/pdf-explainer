import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fitPage, renderPageToCanvas, type RenderHandle } from '../lib/pdf';
import { useShortcuts } from '../hooks/useKeyboard';
import { clamp, cx } from '../lib/utils';
import { useStudy } from '../state/StudyContext';
import { IconButton } from '../components/ui/Button';
import { EmptyState, Skeleton, Spinner } from '../components/ui/Feedback';
import { LayoutMenu, type Layout } from './LayoutMenu';
import { usePdf } from './PdfContext';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

export function SlideStage({
  onOpenSearch,
  layout,
  onLayoutChange,
  restoreLayout = 'split',
  showNotesLayouts = true,
  filmstrip,
  rightInset,
  children,
}: {
  onOpenSearch: () => void;
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
  const renderRef = useRef<RenderHandle | null>(null);

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

  /* Render the current page. Every path cancels the previous render task first. */
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
      const handle = renderPageToCanvas(page, canvas, { scale: fit.scale });
      renderRef.current = handle;
      try {
        await handle.done;
      } finally {
        if (renderRef.current === handle) renderRef.current = null;
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
    };
  }, [doc, box, zoom, focus, state.currentSlide]);

  useEffect(() => () => renderRef.current?.cancel(), []);

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

  /* Swipe between slides on touch devices. */
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
                role="img"
              />
            </div>
          </div>
        )}

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

      {children}

      {/* Floating control bar */}
      <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center px-3">
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
