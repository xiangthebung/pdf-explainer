import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Clock,
  FileUp,
  Keyboard,
  MessageCircleQuestion,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { sessionStore } from '../lib/storage';
import { cx, formatBytes, plural, relativeTime } from '../lib/utils';
import { useServerConfig } from '../state/ServerConfigContext';
import { usePreferences } from '../state/PreferencesContext';
import { useStudy } from '../state/StudyContext';
import type { SessionSummary } from '../state/types';
import { Button, IconButton } from '../components/ui/Button';
import { Notice, Spinner } from '../components/ui/Feedback';
import { StylePicker } from '../components/ui/StylePicker';
import { Chip, type Tint } from '../components/ui/Surface';

/** The three things this app does, in the three colours it does them in. */
const HIGHLIGHTS: { label: string; tint: Tint; icon: typeof BookOpen }[] = [
  { label: 'Slide-by-slide notes', tint: 'violet', icon: BookOpen },
  { label: 'Ask anything', tint: 'cyan', icon: MessageCircleQuestion },
  { label: 'Active recall', tint: 'amber', icon: Target },
];

/**
 * A real note from the demo deck, shown to a visitor with no key. It brings the
 * Markdown and KaTeX stack with it, which the upload screen otherwise avoids,
 * so it loads after the page rather than before it.
 */
const DemoPreview = lazy(() => import('./DemoPreview'));

export function UploadScreen({
  onOpenSettings,
  onOpenShortcuts,
}: {
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
}): React.JSX.Element {
  const { actions, needsKey } = useStudy();
  const { prefs, update } = usePreferences();
  const config = useServerConfig();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  /* A key is present, and asking Google what it can do did not work. */
  const keyUnverified = !needsKey && Boolean(config.modelsError);

  /* Every saved deck, explained or not. A deck you uploaded and read to slide
     twelve is worth going back to whether or not a note was ever written for it —
     and it is the case that used to be lost entirely on a refresh. */
  const refreshSessions = useCallback(() => {
    void sessionStore.list().then((list) => setSessions(list.slice(0, 3)));
  }, []);

  useEffect(refreshSessions, [refreshSessions]);

  const accept = useCallback(
    async (file: File) => {
      setError(null);
      const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!looksPdf) {
        setError('That is not a PDF. Export your slides as PDF and try again.');
        return;
      }
      if (file.size > config.maxUploadMb * 1024 * 1024) {
        setError(
          `That deck is ${formatBytes(file.size)}. The limit is ${config.maxUploadMb} MB — try exporting at a lower image quality.`,
        );
        return;
      }

      setBusy('Reading your deck…');
      try {
        // pdf.js is ~130 KB gzipped; it loads now rather than on first paint.
        const pdf = await import('../lib/pdf');
        const source = await pdf.readPdfFile(file);
        // Open once here to validate and count pages, so the workspace starts
        // with a correct slide count rather than guessing.
        const doc = await pdf.openDocument(source.base64);
        const totalSlides = doc.numPages;
        await pdf.closeDocument(doc);
        actions.openDeck({ source, totalSlides });
      } catch (failure) {
        setError(
          failure instanceof Error && failure.name === 'PdfLoadError'
            ? failure.message
            : 'Could not read that PDF. It may be corrupted — try re-exporting it.',
        );
      } finally {
        setBusy(null);
      }
    },
    [actions, config.maxUploadMb],
  );

  /* Window-wide drop target: dropping anywhere on the page works. */
  useEffect(() => {
    const onEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) void accept(file);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [accept]);

  return (
    <main id="main" tabIndex={-1} className="scroll-area h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[640px] flex-col justify-center px-5 py-10 sm:py-16">
        <header className="hero-glow text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-violet-soft shadow-soft">
            <BookOpen className="h-6 w-6 text-violet" />
          </div>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[36px]">
            Understand your <span className="text-rainbow">lecture slides</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[440px] text-[15px] leading-relaxed text-ink-2">
            Drop in a slide deck. Read it one slide at a time with notes written for you, ask questions as they come up,
            then practise until it sticks.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {HIGHLIGHTS.map((highlight) => (
              <Chip key={highlight.label} tone={highlight.tint}>
                <highlight.icon className="h-3 w-3" />
                {highlight.label}
              </Chip>
            ))}
          </div>
        </header>

        {error ? (
          <Notice tone="error" className="mt-6" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        ) : null}

        <div
          className={cx(
            'mt-7 rounded-[20px] border-2 border-dashed p-7 text-center transition-colors duration-200 sm:p-9',
            dragging ? 'border-violet bg-violet-soft' : 'border-line bg-surface',
          )}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <Spinner className="h-5 w-5" label={busy} />
              <p className="text-[14px] text-ink-2">{busy}</p>
            </div>
          ) : (
            <>
              <FileUp className={cx('mx-auto h-7 w-7', dragging ? 'text-violet' : 'text-ink-3')} />
              <p className="mt-3 text-[15px] font-medium text-ink">
                {dragging ? 'Drop it anywhere' : 'Drag your slide PDF here'}
              </p>
              {/* "stays on your device" read as a promise the app does not keep: the deck
                  goes to Google to be explained. What is true is the narrower thing — it is
                  never stored on this server — and the panel below says where it does go. */}
              <p className="mt-1 text-[13px] text-ink-3">
                Up to {config.maxUploadMb} MB · never stored on our server
              </p>
              <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <Button variant="primary" onClick={() => inputRef.current?.click()}>
                  Choose a PDF
                </Button>
                <Button
                  variant="ghost"
                  icon={<Play className="h-3.5 w-3.5" />}
                  onClick={() => void actions.openDemo()}
                >
                  Try the demo lecture
                </Button>
              </div>
              {/* Out of the tab order: the button above opens it, so as a stop of
                  its own it was an unlabelled control that appeared to do nothing.
                  The name is here for anything that reaches it another way. */}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                tabIndex={-1}
                aria-label="Choose a PDF"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void accept(file);
                }}
              />
            </>
          )}
        </div>

        {/* Resume -------------------------------------------------------- */}
        {sessions.length > 0 ? (
          <section className="mt-7">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">Pick up where you left off</p>
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void actions.restore(session.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-[13px] border border-line bg-surface p-3 text-left transition-colors hover:border-violet hover:bg-violet-soft"
                  >
                    <Clock className="h-4 w-4 shrink-0 text-violet" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{session.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {session.explainedSlides > 0
                          ? `${session.explainedSlides} of ${plural(session.totalSlides, 'slide')} explained`
                          : `On slide ${session.currentSlide} of ${session.totalSlides} · not explained yet`}
                        {' · '}
                        {relativeTime(session.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    label={`Delete ${session.name}`}
                    size="sm"
                    onClick={async () => {
                      await sessionStore.remove(session.id);
                      refreshSessions();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* What the notes look like, for a visitor who cannot generate any yet. */}
        {needsKey ? (
          <Suspense fallback={null}>
            <DemoPreview onOpenDemo={() => void actions.openDemo()} />
          </Suspense>
        ) : null}

        {/* Study style ---------------------------------------------------- */}
        <section className="mt-7">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">How should it teach?</p>
          <StylePicker value={prefs.style} onChange={(style) => update({ style })} />
          <p className="mt-2 text-[12px] text-ink-3">You can change this, and add your own instructions, from Settings at any time.</p>
        </section>

        {/* Key + footer -------------------------------------------------- */}
        {/*
          Three states, not two. A key that is present but whose model list did
          not load looks exactly like a working key from here, and the app used
          to say "Ready to go" right up until the first request failed. The
          catalogue is the earliest point at which a bad key is knowable, so it
          is the point at which to say so.
        */}
        <section className="mt-7 rounded-[16px] border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className={cx('mt-px h-4 w-4 shrink-0', needsKey ? 'text-warn' : keyUnverified ? 'text-bad' : 'text-good')}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink">
                {needsKey
                  ? 'Add your Gemini API key to generate notes'
                  : keyUnverified
                    ? 'Your key did not work'
                    : 'Ready to go'}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                {needsKey
                  ? 'The key is kept on this device and used only to call Google on your behalf. Your slides are never stored on the server.'
                  : keyUnverified
                    ? config.modelsError
                    : /* "only while notes are being generated" was not true: a review set
                         sends the deck as well, one slide window at a time. Chat does not —
                         it sends the current slide's text, its notes and the notes either
                         side. The line has to cover both senders or it is a privacy claim
                         that is quietly wrong. */
                      'Your key is stored locally. Your deck is sent to Google when notes or review items are generated, and not otherwise.'}
              </p>
            </div>
            <Button
              size="sm"
              variant={needsKey || keyUnverified ? 'primary' : 'secondary'}
              icon={<Settings className="h-3.5 w-3.5" />}
              onClick={onOpenSettings}
            >
              {needsKey ? 'Add key' : keyUnverified ? 'Fix key' : 'Settings'}
            </Button>
          </div>
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Notes arrive in batches and keep ahead of you as you read
          </span>
          <button type="button" onClick={onOpenShortcuts} className="inline-flex items-center gap-1.5 hover:text-ink">
            <Keyboard className="h-3.5 w-3.5" /> Keyboard shortcuts
          </button>
        </footer>
      </div>
    </main>
  );
}
