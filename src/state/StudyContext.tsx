import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { normalizeExplainBatch } from '~shared/normalize';
import { toPlainText } from '~shared/markdown';
import { planPractice, type PracticeWindow } from '~shared/practicePlan';
import type { ChatMessage, PracticeItem } from '~shared/types';
import { ApiFailure, api, isCancelled } from '../lib/api';
import { newSessionId, sessionStore } from '../lib/storage';
import { debounce, sleep } from '../lib/utils';
import { usePreferences } from './PreferencesContext';
import { deckProgress, emptyState, studyReducer, toSnapshot, type DeckProgress } from './reducer';
import type { DeckSource, FailureInfo, StudyState } from './types';

interface StudyActions {
  openDeck(input: { source: DeckSource; totalSlides: number }): string;
  openDemo(): Promise<void>;
  restore(id: string): Promise<boolean>;
  reset(): void;
  goto(slide: number): void;
  step(delta: number): void;
  setPages(total: number): void;
  explainFrom(slide: number): Promise<void>;
  cancelExplain(): void;
  dismissExplainError(): void;
  sendChat(input: { message: string; slideText: string }): Promise<void>;
  retryChat(input: { messageId: string; text: string; slideText: string }): Promise<void>;
  clearChat(slide: number): void;
  generatePractice(input?: { append?: boolean }): Promise<void>;
  cancelPractice(): void;
  dismissPracticeWarning(): void;
  answerQuiz(id: string, index: number): void;
  completeItem(id: string): void;
  answerPractice(id: string, value: number | boolean): void;
  resetPractice(): void;
  resetSlideProgress(slide: number): void;
  setStyle(style: StudyState['style']): void;
  setInstructions(value: string): void;
  dismissWarnings(): void;
}

interface StudyValue {
  state: StudyState;
  progress: DeckProgress;
  actions: StudyActions;
  /** True when a key is required but not yet provided. */
  needsKey: boolean;
}

const StudyContext = createContext<StudyValue | null>(null);

function toFailure(error: unknown): FailureInfo {
  if (error instanceof ApiFailure) {
    return { message: error.message, code: error.code, retryable: error.retryable };
  }
  return {
    message: error instanceof Error ? error.message : 'Something went wrong.',
    code: 'server',
    retryable: true,
  };
}

function messageId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function StudyProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(studyReducer, emptyState);
  const { prefs, apiKey } = usePreferences();

  const explainRef = useRef<AbortController | null>(null);
  const practiceRef = useRef<AbortController | null>(null);
  const chatRef = useRef<AbortController | null>(null);
  /** Guards against a slow response landing in a session that no longer exists. */
  const sessionRef = useRef<string>('');
  sessionRef.current = state.id;

  const abortAll = useCallback(() => {
    explainRef.current?.abort();
    practiceRef.current?.abort();
    chatRef.current?.abort();
    explainRef.current = null;
    practiceRef.current = null;
    chatRef.current = null;
  }, []);

  useEffect(() => abortAll, [abortAll]);

  /* ---------------------------------------------------------------- persistence */

  const persist = useMemo(
    () =>
      debounce((snapshot: ReturnType<typeof toSnapshot>) => {
        if (snapshot) void sessionStore.save(snapshot);
      }, 700),
    [],
  );

  useEffect(() => {
    if (!state.source || !state.updatedAt) return;
    persist(toSnapshot(state));
  }, [state, persist]);

  useEffect(() => () => persist.flush(), [persist]);

  /* --------------------------------------------------------------------- session */

  const openDeck = useCallback<StudyActions['openDeck']>(
    ({ source, totalSlides }) => {
      abortAll();
      const id = newSessionId();
      dispatch({
        type: 'session/open',
        id,
        source,
        totalSlides,
        style: prefs.style,
        customInstructions: prefs.customInstructions,
      });
      return id;
    },
    [abortAll, prefs.style, prefs.customInstructions],
  );

  const openDemo = useCallback(async () => {
    abortAll();
    const demo = await import('../demo/demoDeck');
    const batch = normalizeExplainBatch(demo.DEMO_RAW_RESPONSE, { requestedFrom: 1, totalSlides: demo.DEMO_TOTAL_SLIDES });
    dispatch({
      type: 'session/open',
      id: newSessionId(),
      source: { base64: demo.DEMO_PDF_BASE64, name: demo.DEMO_NAME, bytes: Math.round((demo.DEMO_PDF_BASE64.length * 3) / 4) },
      totalSlides: demo.DEMO_TOTAL_SLIDES,
      style: 'auto',
      customInstructions: '',
      isDemo: true,
      notes: batch.notes,
      track: batch.track,
      trackNote: batch.trackNote,
    });
  }, [abortAll]);

  const restore = useCallback(
    async (id: string) => {
      const snapshot = await sessionStore.load(id);
      if (!snapshot) return false;
      abortAll();
      dispatch({ type: 'session/restore', snapshot });
      return true;
    },
    [abortAll],
  );

  const reset = useCallback(() => {
    abortAll();
    persist.cancel();
    dispatch({ type: 'session/reset' });
  }, [abortAll, persist]);

  /* --------------------------------------------------------------------- explain */

  const explainFrom = useCallback(
    async (slide: number) => {
      if (!state.source || state.explain.status === 'running') return;
      const sessionId = state.id;
      const controller = new AbortController();
      explainRef.current?.abort();
      explainRef.current = controller;

      dispatch({ type: 'explain/start', from: slide });
      try {
        const { batch } = await api.explain(
          {
            pdfBase64: state.source.base64,
            startSlide: slide,
            totalSlides: state.totalSlides,
            style: state.style,
            customInstructions: state.customInstructions,
            model: prefs.explainModel,
            apiKey: apiKey || undefined,
          },
          controller.signal,
        );
        if (sessionRef.current !== sessionId) return;
        dispatch({ type: 'explain/success', batch });
      } catch (error) {
        if (sessionRef.current !== sessionId) return;
        if (isCancelled(error)) dispatch({ type: 'explain/idle' });
        else dispatch({ type: 'explain/failure', error: toFailure(error) });
      } finally {
        if (explainRef.current === controller) explainRef.current = null;
      }
    },
    [state.source, state.explain.status, state.id, state.totalSlides, state.style, state.customInstructions, prefs.explainModel, apiKey],
  );

  const cancelExplain = useCallback(() => {
    explainRef.current?.abort();
    explainRef.current = null;
    dispatch({ type: 'explain/idle' });
  }, []);

  /* ------------------------------------------------------------------------ chat */

  const runChat = useCallback(
    async (input: { text: string; slideText: string; history: ChatMessage[]; userMessage: ChatMessage }) => {
      if (!state.source) return;
      const sessionId = state.id;
      const controller = new AbortController();
      chatRef.current?.abort();
      chatRef.current = controller;

      const note = state.notes[input.userMessage.slide];
      const noteText = note ? toPlainText(note.blocks.map((block) => block.content).join('\n\n'), 5000) : '';

      try {
        const { reply } = await api.chat(
          {
            slide: input.userMessage.slide,
            slideText: input.slideText,
            noteText,
            history: input.history
              .filter((message) => !message.failed)
              .map((message) => ({ role: message.role, text: message.text })),
            message: input.text,
            model: prefs.chatModel,
            apiKey: apiKey || undefined,
          },
          controller.signal,
        );
        if (sessionRef.current !== sessionId) return;
        dispatch({
          type: 'chat/reply',
          message: {
            id: messageId(),
            role: 'assistant',
            text: reply,
            slide: input.userMessage.slide,
            createdAt: Date.now(),
          },
        });
      } catch (error) {
        if (sessionRef.current !== sessionId) return;
        if (isCancelled(error)) {
          dispatch({ type: 'chat/retry', slide: input.userMessage.slide, messageId: input.userMessage.id });
          return;
        }
        dispatch({
          type: 'chat/failure',
          slide: input.userMessage.slide,
          messageId: input.userMessage.id,
          error: toFailure(error),
        });
      } finally {
        if (chatRef.current === controller) chatRef.current = null;
      }
    },
    [state.source, state.id, state.notes, prefs.chatModel, apiKey],
  );

  const sendChat = useCallback<StudyActions['sendChat']>(
    async ({ message, slideText }) => {
      const text = message.trim();
      if (!text || state.chatPending !== null) return;
      const slide = state.currentSlide;
      const userMessage: ChatMessage = { id: messageId(), role: 'user', text, slide, createdAt: Date.now() };
      const history = state.chat[slide] ?? [];
      dispatch({ type: 'chat/send', message: userMessage });
      await runChat({ text, slideText, history, userMessage });
    },
    [state.chatPending, state.currentSlide, state.chat, runChat],
  );

  const retryChat = useCallback<StudyActions['retryChat']>(
    async ({ messageId: failedId, text, slideText }) => {
      const slide = state.currentSlide;
      const history = (state.chat[slide] ?? []).filter((message) => message.id !== failedId);
      dispatch({ type: 'chat/retry', slide, messageId: failedId });
      const userMessage: ChatMessage = { id: messageId(), role: 'user', text, slide, createdAt: Date.now() };
      dispatch({ type: 'chat/send', message: userMessage });
      await runChat({ text, slideText, history, userMessage });
    },
    [state.currentSlide, state.chat, runChat],
  );

  const clearChat = useCallback((slide: number) => {
    chatRef.current?.abort();
    chatRef.current = null;
    dispatch({ type: 'chat/clear', slide });
  }, []);

  /* -------------------------------------------------------------------- practice */

  /**
   * Review sets are built to a plan that respects the model's rate limit.
   *
   * A high-limit model walks the deck in windows, so items appear while the rest
   * is still being written. A five-a-minute model covers the whole deck in one
   * bigger pass instead — four requests would be most of its minute, and being
   * rate-limited half way through is worse than a slightly smaller set. Either
   * way requests are paced, and a 429 gets one patient retry before we stop.
   */
  const generatePractice = useCallback<StudyActions['generatePractice']>(
    async ({ append = false } = {}) => {
      if (!state.source || state.practice.status === 'running') return;
      const sessionId = state.id;
      const controller = new AbortController();
      practiceRef.current?.abort();
      practiceRef.current = controller;

      const total = Math.max(1, state.totalSlides);
      const plan = planPractice(total, prefs.practiceModel);
      const windows = plan.windows;
      // Only the "add more" pass tells the model what it already asked. On the
      // first pass that list measurably shrinks the batch without reducing
      // repeats — those are filtered in the reducer instead.
      const known = append
        ? state.practice.items.map((item) => ({
            kind: item.kind,
            slide: item.slide,
            label: describePracticeItem(item),
          }))
        : [];

      dispatch({
        type: 'practice/start',
        append,
        total: windows.length,
        from: windows[0].from,
        to: windows[0].to,
      });

      let landed = 0;
      let emptyWindows = 0;
      let rateLimited = false;
      let lastError: unknown = null;
      let lastStart = 0;

      const paced = async () => {
        const wait = lastStart === 0 ? 0 : plan.spacingMs - (Date.now() - lastStart);
        if (wait > 0) await sleep(wait, controller.signal);
        lastStart = Date.now();
      };

      const request = (window: PracticeWindow) =>
        api.practice(
          {
            pdfBase64: state.source!.base64,
            totalSlides: total,
            fromSlide: window.from,
            toSlide: window.to,
            targetCount: window.target,
            model: prefs.practiceModel,
            apiKey: apiKey || undefined,
            existing: known.filter((item) => item.slide >= window.from && item.slide <= window.to),
          },
          controller.signal,
        );

      try {
        for (const [index, window] of windows.entries()) {
          if (controller.signal.aborted || sessionRef.current !== sessionId) break;
          if (index > 0) dispatch({ type: 'practice/window', from: window.from, to: window.to });

          try {
            await paced();
            let response;
            try {
              response = await request(window);
            } catch (error) {
              // One patient retry for a rate limit: waiting out the window is
              // cheaper than losing the rest of the deck.
              if (toFailure(error).code !== 'quota' || controller.signal.aborted) throw error;
              dispatch({ type: 'practice/waiting', untilMs: Date.now() + plan.spacingMs });
              await sleep(plan.spacingMs, controller.signal);
              lastStart = Date.now();
              response = await request(window);
            }
            if (sessionRef.current !== sessionId) return;

            const items = response.set.items;
            if (items.length === 0) emptyWindows += 1;
            else {
              landed += items.length;
              // Namespace the ids: the server numbers each response from zero.
              dispatch({
                type: 'practice/chunk',
                done: index + 1,
                items: items.map((item) => ({ ...item, id: `w${window.from}-${item.id}` })),
              });
            }
          } catch (error) {
            if (isCancelled(error)) break;
            lastError = error;
            const failure = toFailure(error);
            // A rejected key or an exhausted quota will not fix itself on the
            // next window, so stop rather than burn through the deck.
            if (failure.code === 'missing_key' || failure.code === 'invalid_key') break;
            if (failure.code === 'quota') {
              rateLimited = true;
              break;
            }
            emptyWindows += 1;
          }
        }

        if (sessionRef.current !== sessionId) return;
        const stopped = controller.signal.aborted;

        if (!stopped && landed === 0) {
          dispatch({
            type: 'practice/failure',
            error: lastError
              ? toFailure(lastError)
              : {
                  message: 'No usable review items came back. Trying again usually fixes it.',
                  code: 'empty_result',
                  retryable: true,
                },
          });
          return;
        }

        dispatch({
          type: 'practice/done',
          warning: stopped
            ? landed
              ? 'Stopped early. Add more questions when you want the rest of the deck.'
              : null
            : rateLimited
              ? `Google rate-limited this model before the deck was covered. ${
                  plan.requestsPerMinute < 10
                    ? 'Flash Lite has a much higher limit if you want the rest.'
                    : 'Wait a minute, then add more questions.'
                }`
              : emptyWindows
                ? `${emptyWindows} of ${windows.length} passes came back empty. Add more questions to fill the gaps.`
                : null,
        });
      } finally {
        if (practiceRef.current === controller) practiceRef.current = null;
      }
    },
    [state.source, state.practice.status, state.practice.items, state.id, state.totalSlides, prefs.practiceModel, apiKey],
  );

  const cancelPractice = useCallback(() => {
    practiceRef.current?.abort();
    practiceRef.current = null;
  }, []);

  /* ------------------------------------------------------------------- bookkeeping */

  const actions = useMemo<StudyActions>(
    () => ({
      openDeck,
      openDemo,
      restore,
      reset,
      goto: (slide) => dispatch({ type: 'slide/goto', slide }),
      step: (delta) => dispatch({ type: 'slide/goto', slide: state.currentSlide + delta }),
      setPages: (total) => dispatch({ type: 'deck/pages', totalSlides: total }),
      explainFrom,
      cancelExplain,
      dismissExplainError: () => dispatch({ type: 'explain/idle' }),
      sendChat,
      retryChat,
      clearChat,
      generatePractice,
      cancelPractice,
      dismissPracticeWarning: () => dispatch({ type: 'practice/notice', warning: null }),
      answerQuiz: (id, index) => dispatch({ type: 'quiz/answer', id, index }),
      completeItem: (id) => dispatch({ type: 'item/complete', id }),
      answerPractice: (id, value) => dispatch({ type: 'practice/answer', id, value }),
      resetPractice: () => dispatch({ type: 'practice/reset' }),
      resetSlideProgress: (slide) => dispatch({ type: 'progress/reset', slide }),
      setStyle: (style) => dispatch({ type: 'style/set', style }),
      setInstructions: (value) => dispatch({ type: 'instructions/set', value }),
      dismissWarnings: () => dispatch({ type: 'warnings/dismiss' }),
    }),
    [
      openDeck,
      openDemo,
      restore,
      reset,
      explainFrom,
      cancelExplain,
      sendChat,
      retryChat,
      clearChat,
      generatePractice,
      cancelPractice,
      state.currentSlide,
    ],
  );

  const progress = useMemo(() => deckProgress(state), [state]);
  const value = useMemo<StudyValue>(
    () => ({ state, progress, actions, needsKey: !apiKey.trim() }),
    [state, progress, actions, apiKey],
  );

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

function describePracticeItem(item: PracticeItem): string {
  if (item.kind === 'quiz') return item.question.slice(0, 110);
  if (item.kind === 'match') return item.pairs.map((pair) => pair.concept).join(', ').slice(0, 110);
  return `${item.before} ___ ${item.after}`.slice(0, 110);
}

export function useStudy(): StudyValue {
  const value = useContext(StudyContext);
  if (!value) throw new Error('useStudy must be used inside StudyProvider');
  return value;
}
