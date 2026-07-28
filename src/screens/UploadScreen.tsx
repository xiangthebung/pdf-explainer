import { useCallback, useEffect, useRef, useState } from 'react';
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
import { STUDY_STYLES } from '~shared/types';
import { sessionStore } from '../lib/storage';
import { cx, formatBytes, plural, relativeTime } from '../lib/utils';
import { useServerConfig } from '../hooks/useServerConfig';
import { usePreferences } from '../state/PreferencesContext';
import { useStudy } from '../state/StudyContext';
import type { SessionSummary } from '../state/types';
import { Button, IconButton } from '../components/ui/Button';
import { Notice, Spinner } from '../components/ui/Feedback';
import { Chip, STYLE_TINTS, TINT_CLASS, type Tint } from '../components/ui/Surface';

/** The three things this app does, in the three colours it does them in. */
const HIGHLIGHTS: { label: string; tint: Tint; icon: typeof BookOpen }[] = [
  { label: 'Slide-by-slide notes', tint: 'violet', icon: BookOpen },
  { label: 'Ask anything', tint: 'cyan', icon: MessageCircleQuestion },
  { label: 'Active recall', tint: 'amber', icon: Target },
];



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

  const refreshSessions = useCallback(() => {
    void sessionStore.list().then((list) => setSessions(list.filter((entry) => entry.explainedSlides > 0).slice(0, 3)));
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
    <div className="scroll-area h-full overflow-y-auto">
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
              <p className="mt-1 text-[13px] text-ink-3">Up to {config.maxUploadMb} MB · stays on your device</p>
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
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
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

        {/* Study style ---------------------------------------------------- */}
        <section className="mt-7">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">How should it teach?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STUDY_STYLES.map((style) => {
              const selected = prefs.style === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({ style: style.id })}
                  className={cx(
                    'rounded-[13px] border p-3 text-left transition-colors',
                    TINT_CLASS[STYLE_TINTS[style.id] ?? 'accent'],
                    selected
                      ? 'tint-ring bg-[var(--tint-soft)]'
                      : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <span className={cx('text-[13px] font-medium', selected ? 'tint-text' : 'text-ink')}>
                    {style.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{style.description}</span>
                </button>
              );
            })}
          </div>
        </section>

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
                        {session.explainedSlides} of {plural(session.totalSlides, 'slide')} explained ·{' '}
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

        {/* Key + footer -------------------------------------------------- */}
        <section className="mt-7 rounded-[16px] border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className={cx('mt-px h-4 w-4 shrink-0', needsKey ? 'text-warn' : 'text-good')} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink">
                {needsKey ? 'Add your Gemini API key to generate notes' : 'Ready to go'}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                {needsKey
                  ? 'The key is kept on this device and used only to call Google on your behalf. Your slides are never stored on the server.'
                  : 'Your key is stored locally. Slides are sent to Google only while notes are being generated.'}
              </p>
            </div>
            <Button size="sm" variant={needsKey ? 'primary' : 'secondary'} icon={<Settings className="h-3.5 w-3.5" />} onClick={onOpenSettings}>
              {needsKey ? 'Add key' : 'Settings'}
            </Button>
          </div>
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Notes arrive in batches, so reading starts in seconds
          </span>
          <button type="button" onClick={onOpenShortcuts} className="inline-flex items-center gap-1.5 hover:text-ink">
            <Keyboard className="h-3.5 w-3.5" /> Keyboard shortcuts
          </button>
        </footer>
      </div>
    </div>
  );
}
