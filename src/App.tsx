import { Suspense, lazy, useState } from 'react';
import { RootBoundary } from './components/RootBoundary';
import { Spinner } from './components/ui/Feedback';
import { SettingsSheet } from './sheets/SettingsSheet';
import { ShortcutsSheet } from './sheets/ShortcutsSheet';
import { UploadScreen } from './screens/UploadScreen';
import { PreferencesProvider } from './state/PreferencesContext';
import { StudyProvider, useStudy } from './state/StudyContext';

/**
 * The workspace pulls in pdf.js, KaTeX and the Markdown stack. None of that is
 * needed to show the upload screen, so it loads when a deck does.
 */
const Workspace = lazy(() => import('./workspace/Workspace').then((module) => ({ default: module.Workspace })));

export default function App(): React.JSX.Element {
  return (
    <RootBoundary>
      <PreferencesProvider>
        <StudyProvider>
          <Shell />
        </StudyProvider>
      </PreferencesProvider>
    </RootBoundary>
  );
}

/**
 * Two states only: no deck (upload) or a deck (workspace). Everything else is a
 * sheet on top, which keeps the mental model — and the routing — simple.
 */
function Shell(): React.JSX.Element {
  const { state } = useStudy();
  const [overlay, setOverlay] = useState<'none' | 'settings' | 'shortcuts'>('none');

  if (state.source) {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-2">
            <Spinner /> Opening your deck…
          </div>
        }
      >
        <Workspace />
      </Suspense>
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
