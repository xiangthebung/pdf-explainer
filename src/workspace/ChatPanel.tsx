import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageCircleQuestion, RotateCcw, Trash2 } from 'lucide-react';
import { getPageText } from '../lib/pdf';
import { cx } from '../lib/utils';
import { useStudy } from '../state/StudyContext';
import { Markdown } from '../components/content/Markdown';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { TINT_CLASS, type Tint } from '../components/ui/Surface';
import { usePdf } from './PdfContext';
import { askAboutText } from './selection';

const SUGGESTIONS: { text: string; tint: Tint }[] = [
  { text: 'Explain this slide as simply as possible', tint: 'cyan' },
  { text: 'Why does this matter?', tint: 'violet' },
  { text: 'Walk me through the maths step by step', tint: 'indigo' },
  { text: 'Give me a concrete example', tint: 'teal' },
];

/**
 * A question handed in from outside the panel — the select-to-ask chip on the
 * slide. `nonce` is what makes the same phrase asked twice two questions.
 */
export interface AskPrompt {
  selection: string;
  nonce: number;
}

export function ChatPanel({
  onOpenSettings,
  prompt = null,
  onPromptConsumed,
}: {
  onOpenSettings: () => void;
  prompt?: AskPrompt | null;
  onPromptConsumed?: () => void;
}): React.JSX.Element {
  const { state, actions, needsKey } = useStudy();
  const { doc } = usePdf();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const slide = state.currentSlide;
  const messages = state.chat[slide] ?? [];
  const pending = state.chatPending === slide;

  /* Stick to the bottom while a conversation is active. */
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, pending, slide]);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft]);

  const slideText = useCallback(async () => {
    if (!doc) return '';
    try {
      return await getPageText(doc, slide);
    } catch {
      return '';
    }
  }, [doc, slide]);

  const send = useCallback(
    async (text: string, selection?: string) => {
      const message = text.trim();
      if (!message || pending) return;
      setDraft('');
      await actions.sendChat({ message, slideText: await slideText(), selection });
    },
    [actions, pending, slideText],
  );

  /*
   * A selection arriving from the slide is sent as it stands. If it cannot be —
   * no key yet, or an answer still in flight — it becomes the draft instead, so
   * the phrase the reader went to the trouble of highlighting is not lost.
   */
  const consumedRef = useRef(0);
  useEffect(() => {
    if (!prompt || prompt.nonce === consumedRef.current) return;
    consumedRef.current = prompt.nonce;
    const text = askAboutText(prompt.selection);
    if (needsKey || state.chatPending !== null) setDraft(text);
    else void send(text, prompt.selection);
    onPromptConsumed?.();
  }, [prompt, needsKey, state.chatPending, send, onPromptConsumed]);

  const lastUserMessage = [...messages].reverse().find((entry) => entry.role === 'user');

  /**
   * One short line when an answer lands, for a reader who cannot see it appear.
   *
   * Not the answer itself: a reply marked live is re-read from the top every
   * time React touches it, and these are long. The count is in the text on
   * purpose — a live region whose text does not change says nothing, so two
   * replies in a row would otherwise be one announcement.
   */
  const [reply, setReply] = useState('');
  const replies = messages.reduce((count, entry) => (entry.role === 'assistant' ? count + 1 : count), 0);
  const seen = useRef({ slide, replies });

  useEffect(() => {
    const previous = seen.current;
    seen.current = { slide, replies };
    // Moving between slides swaps the whole conversation. That is a different
    // reader's worth of history, not an answer that has just come back.
    if (previous.slide !== slide || replies <= previous.replies) return;
    setReply(`Reply ${replies} received`);
  }, [slide, replies]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p role="status" className="sr-only">
        {reply}
      </p>

      {/* A tab stop of its own, because the arrows and Page keys that would
          scroll a long conversation are bound to the deck at the window.
          `data-scroll-region` is what tells them to stand down while focus is in
          here, and `role="region"` is what lets the name stick to a div. */}
      <div
        ref={listRef}
        role="region"
        aria-label={`Conversation about slide ${slide}`}
        tabIndex={0}
        data-scroll-region
        className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
      >
        <div className="mx-auto max-w-[680px] space-y-3">
          {messages.length === 0 && !pending ? (
            <EmptyState
              className="py-10"
              tint="cyan"
              icon={<MessageCircleQuestion className="h-5 w-5" />}
              title={`Ask about slide ${slide}`}
              description={
                <>
                  The tutor sees this slide's text, your notes for it and the notes on the slides either side — never
                  the whole deck.
                  <span className="mt-1.5 block text-ink-3">
                    Highlight anything on the slide and choose “Ask about this”.
                  </span>
                </>
              }
            />
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cx(
                  'max-w-[88%] rounded-[16px] px-3.5 py-2.5 text-[14px]',
                  message.role === 'user'
                    ? cx('bg-accent text-white', message.failed && 'opacity-60')
                    : 'border border-line bg-surface text-ink',
                )}
              >
                {message.role === 'user' ? (
                  message.selection ? (
                    /* A question that began as a highlight is shown as one: the
                       passage quoted, then the ask. Same words as `text`, drawn
                       so the reader can see which part of the slide it was. */
                    <>
                      <blockquote className="border-l-2 border-white/60 pl-2.5 text-[13px] italic leading-relaxed text-white/90">
                        {message.selection}
                      </blockquote>
                      <p className="mt-1.5 leading-relaxed">Explain this.</p>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                  )
                ) : (
                  <Markdown>{message.text}</Markdown>
                )}
              </div>
            </div>
          ))}

          {pending ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-[16px] border border-line bg-surface px-3.5 py-3">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan"
                    style={{ animationDelay: `${dot * 140}ms` }}
                  />
                ))}
                <span className="sr-only">Thinking</span>
              </div>
            </div>
          ) : null}

          {state.chatError ? (
            <Notice
              tone="error"
              title="The tutor could not answer"
              onRetry={
                state.chatError.code === 'missing_key' || state.chatError.code === 'invalid_key'
                  ? onOpenSettings
                  : lastUserMessage
                    ? async () => {
                        await actions.retryChat({
                          messageId: lastUserMessage.id,
                          text: lastUserMessage.text,
                          slideText: await slideText(),
                        });
                      }
                    : undefined
              }
              retryLabel={
                state.chatError.code === 'missing_key' || state.chatError.code === 'invalid_key'
                  ? 'Open settings'
                  : 'Ask again'
              }
            >
              {state.chatError.message}
            </Notice>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        <div className="mx-auto max-w-[680px]">
          {messages.length === 0 ? (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.text}
                  type="button"
                  disabled={needsKey}
                  onClick={() => void send(suggestion.text)}
                  className={cx(
                    'tint-chip rounded-full px-2.5 py-1 text-[12px] font-medium transition-[opacity,transform] hover:-translate-y-px disabled:opacity-50',
                    TINT_CLASS[suggestion.tint],
                  )}
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          ) : null}

          {needsKey ? (
            <Button block variant="primary" onClick={onOpenSettings}>
              Add your API key to chat
            </Button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2"
            >
              <div className="flex-1 rounded-[16px] border border-line bg-surface-2 px-3 py-2 focus-within:border-cyan focus-within:ring-[3px] focus-within:ring-cyan-soft">
                <label className="sr-only" htmlFor="chat-input">
                  Ask about slide {slide}
                </label>
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  placeholder={`Ask about slide ${slide}…`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  className="max-h-40 w-full resize-none bg-transparent text-[14px] leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none"
                />
              </div>
              <IconButton
                label="Send"
                type="submit"
                variant="primary"
                disabled={!draft.trim() || pending}
                className="mb-0.5"
              >
                <ArrowUp className="h-4 w-4" />
              </IconButton>
            </form>
          )}

          <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-3">
            <span>Enter to send · Shift + Enter for a new line</span>
            {messages.length > 0 ? (
              <div className="flex items-center gap-1">
                {lastUserMessage ? (
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={<RotateCcw className="h-3 w-3" />}
                    onClick={async () => {
                      await actions.retryChat({
                        messageId: lastUserMessage.id,
                        text: lastUserMessage.text,
                        slideText: await slideText(),
                      });
                    }}
                    disabled={pending}
                  >
                    Retry
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="quiet"
                  icon={<Trash2 className="h-3 w-3" />}
                  onClick={() => actions.clearChat(slide)}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
