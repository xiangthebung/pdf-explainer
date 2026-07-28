import { useMemo, useState } from 'react';
import { Check, Clipboard, Download } from 'lucide-react';
import { buildMarkdownExport } from '../lib/export';
import { copyText, downloadFile, formatBytes, plural, slugify } from '../lib/utils';
import { useStudy } from '../state/StudyContext';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Field';
import { Sheet } from '../components/ui/Sheet';
import { EmptyState } from '../components/ui/Feedback';

/**
 * Notes belong to the student. One portable Markdown file, no lock-in.
 */
export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { state } = useStudy();
  const [includePractice, setIncludePractice] = useState(true);
  const [includeChat, setIncludeChat] = useState(false);
  const [copied, setCopied] = useState(false);

  const notes = useMemo(() => Object.values(state.notes).sort((a, b) => a.slide - b.slide), [state.notes]);
  const chat = useMemo(
    () => Object.values(state.chat).flat().sort((a, b) => a.createdAt - b.createdAt),
    [state.chat],
  );

  const markdown = useMemo(
    () =>
      buildMarkdownExport({
        deckName: state.source?.name ?? 'Lecture notes',
        totalSlides: state.totalSlides,
        trackNote: state.trackNote,
        notes,
        practice: state.practice.items,
        chat,
        includePractice,
        includeChat,
      }),
    [state.source?.name, state.totalSlides, state.trackNote, notes, state.practice.items, chat, includePractice, includeChat],
  );

  const filename = `${slugify(state.source?.name ?? 'lecture')}-notes.md`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Export your notes"
      description="Markdown, with the LaTeX, code and diagrams intact."
      footer={
        <>
          <Button
            variant="secondary"
            icon={copied ? <Check className="h-4 w-4 text-good" /> : <Clipboard className="h-4 w-4" />}
            onClick={async () => {
              const ok = await copyText(markdown);
              if (!ok) return;
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            disabled={notes.length === 0}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="primary"
            icon={<Download className="h-4 w-4" />}
            onClick={() => downloadFile(filename, markdown)}
            disabled={notes.length === 0}
          >
            Download
          </Button>
        </>
      }
    >
      {notes.length === 0 ? (
        <EmptyState
          title="Nothing to export yet"
          description="Generate notes for at least one slide and they will show up here."
        />
      ) : (
        <div className="space-y-5">
          <div className="rounded-[13px] border border-line bg-surface-2 p-3.5">
            <p className="text-[13.5px] font-medium text-ink">{filename}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              {plural(notes.length, 'slide')} of notes · {formatBytes(new Blob([markdown]).size)}
            </p>
          </div>

          <div className="space-y-3.5">
            <Toggle
              checked={includePractice}
              onChange={setIncludePractice}
              label="Include practice and answers"
              description="Quizzes, matching pairs and blanks, with the answers marked."
            />
            <Toggle
              checked={includeChat}
              onChange={setIncludeChat}
              label="Include tutor conversations"
              description={chat.length ? `${plural(chat.length, 'message')} across the deck.` : 'No conversations yet.'}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Preview</p>
            <pre className="scroll-area max-h-56 overflow-auto whitespace-pre-wrap rounded-[12px] border border-line bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
              {markdown.slice(0, 1400)}
              {markdown.length > 1400 ? '\n…' : ''}
            </pre>
          </div>
        </div>
      )}
    </Sheet>
  );
}
