import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftOpen, PanelRightClose, Presentation } from 'lucide-react';
import { cx } from '../lib/utils';
import { IconButton } from '../components/ui/Button';
import { useIsCompact } from '../hooks/useMediaQuery';
import { useShortcuts } from '../hooks/useKeyboard';
import { usePanelResize } from '../hooks/usePanelResize';
import { usePreferences } from '../state/PreferencesContext';
import { useStudy } from '../state/StudyContext';
import { Segmented } from '../components/ui/Surface';
import { ExportSheet } from '../sheets/ExportSheet';
import { SettingsSheet } from '../sheets/SettingsSheet';
import { ShortcutsSheet } from '../sheets/ShortcutsSheet';
import { Filmstrip } from './Filmstrip';
import type { Layout } from './LayoutMenu';
import { NotesOverlay } from './NotesOverlay';
import { PdfProvider, usePdf } from './PdfContext';
import { SearchPalette } from './SearchPalette';
import { SlideStage } from './SlideStage';
import { STUDY_TABS, StudyPanel, type StudyTab } from './StudyPanel';
import { TopBar } from './TopBar';

type CompactView = 'slide' | StudyTab;
type Overlay = 'none' | 'settings' | 'export' | 'shortcuts' | 'search';

/**
 * The document is the source of truth for how many slides exist; a restored
 * session or a model's self-report can be wrong.
 */
function PageCountSync(): null {
  const { doc } = usePdf();
  const { actions } = useStudy();

  useEffect(() => {
    if (doc) actions.setPages(doc.numPages);
  }, [doc, actions]);

  return null;
}

const MIN_PANEL = 360;
const MAX_PANEL = 720;
/** How much of the window the slide keeps, however wide the notes are dragged. */
const MIN_STAGE = 360;

/**
 * The stub that a collapsed panel leaves behind. A hidden panel with no visible
 * way back is the classic version of this mistake, so the rail stays put and
 * labelled.
 */
function EdgeRail({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center border-r border-line bg-bg py-2">
      <IconButton label={label} size="sm" onClick={onClick}>
        {children}
      </IconButton>
    </div>
  );
}

/**
 * The study workspace: slides on the left, study surface on the right, one
 * column on a phone. The divider position is remembered, and every overlay is a
 * focus-trapped sheet so keyboard users never get lost.
 */
export function Workspace(): React.JSX.Element {
  const { state, actions } = useStudy();
  const { prefs, update } = usePreferences();
  const compact = useIsCompact();
  const [tab, setTab] = useState<StudyTab>('notes');
  const [compactView, setCompactView] = useState<CompactView>('slide');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const frameRef = useRef<HTMLDivElement | null>(null);
  /** Layout to put back when "slide only" ends. */
  const beforeFocus = useRef<{ panelCollapsed: boolean; filmstrip: boolean } | null>(null);
  /** Which notes layout "show notes" should return to. */
  const restoreRef = useRef<Layout>(prefs.panelMode === 'overlay' ? 'overlay' : 'split');

  /**
   * One width for both layouts, and one way to change it.
   *
   * The drag used to be written inline here and wired only to the split view's divider, so
   * the floating overlay took the same number and could not alter it — resizable in one
   * mode, fixed in the other, for no reason a person could work out from looking at it.
   * `usePanelResize` owns the pointer bookkeeping; the divider and the overlay's edge are
   * two handles onto it.
   *
   * `reserve` is the slide's floor. `max` alone is not enough on a narrow window, where
   * 720px of notes would leave nothing to read them against.
   */
  const resize = usePanelResize({
    committed: prefs.panelWidth,
    min: MIN_PANEL,
    max: MAX_PANEL,
    roomFor: () => frameRef.current?.clientWidth ?? 0,
    reserve: MIN_STAGE,
    commit: (panelWidth) => update({ panelWidth }),
  });
  const panelWidth = resize.width;

  const panelOpen = !prefs.panelCollapsed;
  /**
   * One value for the whole layout question, so the menu, the shortcuts and the
   * rendering all agree on what is currently true.
   */
  const layout: Layout = compact
    ? 'split'
    : prefs.panelCollapsed
      ? 'slide'
      : prefs.panelMode === 'overlay'
        ? 'overlay'
        : 'split';
  /** Notes float over a full-bleed slide instead of taking a column. */
  const overlayNotes = layout === 'overlay';
  const focusMode = layout === 'slide';
  const dockedPanel = layout === 'split' && !compact;

  const toggleFilmstrip = useCallback(() => update({ filmstrip: !prefs.filmstrip }), [prefs.filmstrip, update]);

  /**
   * Leaving "slide only" restores the layout you had, not a default one. Hiding
   * the thumbnails, showing the slide alone, then coming back should not quietly
   * bring the thumbnails back — and it should return you to floating notes if
   * that is where you were.
   */
  const setLayout = useCallback(
    (next: Layout) => {
      if (next === 'slide') {
        if (layout !== 'slide') {
          beforeFocus.current = { panelCollapsed: prefs.panelCollapsed, filmstrip: prefs.filmstrip };
          restoreRef.current = layout;
        }
        update({ panelCollapsed: true, filmstrip: false });
        return;
      }
      const snapshot = beforeFocus.current;
      beforeFocus.current = null;
      restoreRef.current = next;
      update({
        panelMode: next === 'overlay' ? 'overlay' : 'docked',
        panelCollapsed: false,
        filmstrip: layout === 'slide' ? (snapshot?.filmstrip ?? true) : prefs.filmstrip,
      });
    },
    [layout, prefs.panelCollapsed, prefs.filmstrip, update],
  );

  /** `L` walks the three layouts in a fixed order, so it is learnable. */
  const cycleLayout = useCallback(() => {
    const order: Layout[] = ['split', 'overlay', 'slide'];
    setLayout(order[(order.indexOf(layout) + 1) % order.length]);
  }, [layout, setLayout]);

  /** `N` is the on/off switch for the notes, whichever layout they live in. */
  const toggleNotes = useCallback(() => {
    setLayout(layout === 'slide' ? restoreRef.current : 'slide');
  }, [layout, setLayout]);

  const openSettings = useCallback(() => setOverlay('settings'), []);
  const showTab = useCallback(
    (next: StudyTab) => {
      setTab(next);
      if (compact) setCompactView(next);
    },
    [compact],
  );

  useShortcuts(
    {
      ArrowRight: () => actions.step(1),
      ArrowLeft: () => actions.step(-1),
      ' ': () => actions.step(1),
      PageDown: () => actions.step(1),
      PageUp: () => actions.step(-1),
      j: () => actions.step(1),
      k: () => actions.step(-1),
      Home: () => actions.goto(1),
      End: () => actions.goto(state.totalSlides),
      '1': () => showTab('notes'),
      '2': () => showTab('chat'),
      '3': () => showTab('practice'),
      e: () => {
        if (state.explain.status !== 'running') void actions.explainFrom(state.currentSlide);
      },
      r: () => actions.resetSlideProgress(state.currentSlide),
      f: toggleFilmstrip,
      n: () => {
        if (!compact) toggleNotes();
      },
      l: () => {
        if (!compact) cycleLayout();
      },
      '/': (event) => {
        event.preventDefault();
        setOverlay('search');
      },
      '?': () => setOverlay('shortcuts'),
      Escape: () => {
        if (overlay !== 'none') setOverlay('none');
        // While the browser is in full screen, Escape belongs to the browser.
        // Stealing it here would drop two layers of layout in one press.
        else if (document.fullscreenElement) return;
        else if (focusMode) setLayout(restoreRef.current);
      },
    },
    overlay === 'none' || overlay === 'search',
  );

  return (
    <PdfProvider base64={state.source?.base64 ?? null}>
      <PageCountSync />
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <TopBar
          onOpenSettings={openSettings}
          onOpenExport={() => setOverlay('export')}
          onOpenShortcuts={() => setOverlay('shortcuts')}
          onCloseDeck={actions.reset}
        />

        {compact ? (
          <>
            <div className="border-b border-line bg-surface px-3 py-2">
              <Segmented
                className="w-full"
                label="Workspace view"
                size="sm"
                options={[
                  {
                    value: 'slide' as const,
                    label: 'Slide',
                    icon: <Presentation className="h-3.5 w-3.5" />,
                    tint: 'indigo' as const,
                  },
                  ...STUDY_TABS,
                ]}
                value={compactView}
                onChange={(next) => {
                  setCompactView(next);
                  if (next !== 'slide') setTab(next);
                }}
              />
            </div>
            <div className="min-h-0 flex-1">
              {compactView === 'slide' ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1">
                    <SlideStage
                      onOpenSearch={() => setOverlay('search')}
                      layout="split"
                      onLayoutChange={() => undefined}
                      showNotesLayouts={false}
                      filmstrip={{ open: prefs.filmstrip, onToggle: toggleFilmstrip }}
                    />
                  </div>
                  {prefs.filmstrip ? <Filmstrip orientation="horizontal" /> : null}
                </div>
              ) : (
                <StudyPanel tab={tab} onTabChange={showTab} onOpenSettings={openSettings} showTabs={false} />
              )}
            </div>
          </>
        ) : (
          <div ref={frameRef} className="flex min-h-0 flex-1">
            {focusMode ? null : prefs.filmstrip ? (
              <Filmstrip orientation="vertical" onCollapse={toggleFilmstrip} />
            ) : (
              <EdgeRail label="Show thumbnails" onClick={toggleFilmstrip}>
                <PanelLeftOpen className="h-4 w-4" />
              </EdgeRail>
            )}

            {/* The slide never resizes for the notes in overlay mode: the panel
                floats inside the stage, so it also comes along into full
                screen. */}
            <div className="min-w-0 flex-1">
              <SlideStage
                onOpenSearch={() => setOverlay('search')}
                layout={layout}
                onLayoutChange={setLayout}
                restoreLayout={restoreRef.current}
                filmstrip={{ open: prefs.filmstrip, onToggle: toggleFilmstrip }}
                /* Keep the hover arrow clear of the floating panel. */
                rightInset={overlayNotes && panelOpen ? panelWidth + 22 : undefined}
              >
                {overlayNotes && panelOpen && !focusMode ? (
                  <NotesOverlay
                    width={panelWidth}
                    minWidth={MIN_PANEL}
                    maxWidth={MAX_PANEL}
                    resizing={resize.dragging}
                    onResizePointerDown={resize.onPointerDown}
                    onResizeKeyDown={resize.onKeyDown}
                    pinned={prefs.overlayPinned}
                    onTogglePin={() => update({ overlayPinned: !prefs.overlayPinned })}
                    onDock={() => update({ panelMode: 'docked' })}
                    onClose={() => update({ panelCollapsed: true })}
                  >
                    <StudyPanel tab={tab} onTabChange={showTab} onOpenSettings={openSettings} />
                  </NotesOverlay>
                ) : null}
              </SlideStage>
            </div>

            {dockedPanel ? (
              <>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize the study panel"
                  tabIndex={0}
                  aria-valuenow={panelWidth}
                  aria-valuemin={MIN_PANEL}
                  aria-valuemax={MAX_PANEL}
                  onPointerDown={resize.onPointerDown}
                  onKeyDown={resize.onKeyDown}
                  className={cx(
                    'group relative w-px shrink-0 cursor-col-resize bg-line transition-colors hover:bg-accent',
                    resize.dragging && 'bg-accent',
                  )}
                >
                  {/* Wider invisible hit area for the drag. */}
                  <span className="absolute inset-y-0 -left-2 -right-2" />
                  {/* Collapse lives on the seam, where this pattern normally sits. */}
                  <button
                    type="button"
                    aria-label="Hide notes and widen the slide"
                    title="Hide notes and widen the slide"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setLayout('slide')}
                    // Sits high on the seam, clear of the stage's centred
                    // next-slide arrow.
                    className="absolute left-1/2 top-24 z-10 flex h-7 w-7 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-2 opacity-70 shadow-soft transition-[opacity,color] hover:text-ink hover:opacity-100"
                  >
                    <PanelRightClose className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="shrink-0" style={{ width: `${panelWidth}px` }}>
                  <StudyPanel tab={tab} onTabChange={showTab} onOpenSettings={openSettings} />
                </div>
              </>
            ) : null}
          </div>
        )}

        <SettingsSheet open={overlay === 'settings'} onClose={() => setOverlay('none')} />
        <ExportSheet open={overlay === 'export'} onClose={() => setOverlay('none')} />
        <ShortcutsSheet open={overlay === 'shortcuts'} onClose={() => setOverlay('none')} />
        <SearchPalette open={overlay === 'search'} onClose={() => setOverlay('none')} />
      </div>
    </PdfProvider>
  );
}
