import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { RootBoundary } from './components/RootBoundary';
import { Spinner } from './components/ui/Feedback';
import { pickSessionToResume, sessionFromSearch, withSessionParam } from './lib/resume';
import { sessionStore } from './lib/storage';
import { SettingsSheet } from './sheets/SettingsSheet';
import { ShortcutsSheet } from './sheets/ShortcutsSheet';
import { UploadScreen } from './screens/UploadScreen';
import { PreferencesProvider } from './state/PreferencesContext';
import { ServerConfigProvider } from './state/ServerConfigContext';
import { StudyProvider, useStudy } from './state/StudyContext';
import type { ResumeNotice } from './workspace/ResumeCard';

/**
 * The workspace pulls in pdf.js, KaTeX and the Markdown stack. None of that is
 * needed to show the upload screen, so it loads when a deck does.
 */
const Workspace = lazy(() => import('./workspace/Workspace').then((module) => ({ default: module.Workspace })));

export default function App(): React.JSX.Element {
  return (
    <RootBoundary>
      {/* The first tab stop on the page. Both screens mark their content with
          `id="main"`, so this always has somewhere to go — without it the way
          past the top bar is Tab, once per control, every time. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {/* Order matters: the catalogue is scoped to the key in preferences, and
          the study session picks its models out of the catalogue. */}
      <PreferencesProvider>
        <ServerConfigProvider>
          <StudyProvider>
            <Shell />
          </StudyProvider>
        </ServerConfigProvider>
      </PreferencesProvider>
    </RootBoundary>
  );
}

/**
 * Two states only: no deck (upload) or a deck (workspace). Everything else is a
 * sheet on top, which keeps the mental model — and the routing — simple.
 *
 * Plus one moment before either: on load, the last session is reopened where it
 * was left, and `?session=<id>` names a particular one. Closing the deck is the
 * way back to the upload screen, and it stays there — reopening the session you
 * just closed would be the app arguing with you.
 */
function Shell(): React.JSX.Element {
  const { state, actions } = useStudy();
  const [overlay, setOverlay] = useState<'none' | 'settings' | 'shortcuts'>('none');
  const [resuming, setResuming] = useState(true);
  const [resume, setResume] = useState<ResumeNotice | null>(null);
  const dismissResume = useCallback(() => setResume(null), []);

  /* Read through a ref: `actions` changes identity with the state, and this
     effect must run once, on load, not again when the deck is closed. */
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    let cancelled = false;
    const requested = sessionFromSearch(window.location.search);
    (async () => {
      try {
        const list = await sessionStore.list();
        if (cancelled) return;
        const pick = pickSessionToResume(list, requested);
        if (!pick) return;
        const restored = await actionsRef.current.restore(pick.id);
        if (restored && !cancelled) {
          setResume({ name: pick.name, slide: pick.currentSlide, total: pick.totalSlides, updatedAt: pick.updatedAt });
        }
      } finally {
        if (!cancelled) setResuming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* The address bar names the open session, so a reload — or a tab the browser
     restores next week — comes back to this deck and not merely the newest. */
  useEffect(() => {
    if (resuming) return;
    const next = withSessionParam(window.location.search, state.source ? state.id : null);
    if (next === window.location.search) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
  }, [resuming, state.source, state.id]);

  if (state.source) {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-2">
            <Spinner /> Opening your deck…
          </div>
        }
      >
        <Workspace resume={resume} onDismissResume={dismissResume} />
      </Suspense>
    );
  }

  if (resuming) {
    /* Delayed, so a visitor with nothing saved never sees it: the list comes
       back in a few milliseconds and the upload screen paints instead. */
    return (
      <div className="animate-in flex h-full items-center justify-center gap-2 text-[13px] text-ink-2" style={{ animationDelay: '250ms' }}>
        <Spinner /> Picking up where you left off…
      </div>
    );
  }

  return (
    <>
      <UploadScreen onOpenSettings={() => setOverlay('settings')} onOpenShortcuts={() => setOverlay('shortcuts')} />
      <SettingsSheet open={overlay === 'settings'} onClose={() => setOverlay('none')} />
      <ShortcutsSheet open={overlay === 'shortcuts'} onClose={() => setOverlay('none')} />
    </>
  );
}
