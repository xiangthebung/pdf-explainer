import type { ChatMessage, ExplainBatch, PracticeItem, SlideNote, StudyStyle } from '~shared/types';
import type { DeckSource, FailureInfo, SessionSnapshot, StudyState } from './types';

export const emptyState: StudyState = {
  id: '',
  source: null,
  totalSlides: 0,
  currentSlide: 1,
  style: 'auto',
  customInstructions: '',
  track: null,
  trackNote: '',
  notes: {},
  warnings: [],
  explain: { status: 'idle', from: null, startedAt: null, error: null },
  chat: {},
  chatPending: null,
  chatError: null,
  practice: {
    items: [],
    status: 'idle',
    error: null,
    warning: null,
    answers: {},
    generatedAt: null,
    extended: false,
    progress: null,
  },
  quizAnswers: {},
  completed: {},
  isDemo: false,
  updatedAt: 0,
};

export type StudyAction =
  | {
      type: 'session/open';
      id: string;
      source: DeckSource;
      totalSlides: number;
      style: StudyStyle;
      customInstructions: string;
      isDemo?: boolean;
      notes?: SlideNote[];
      track?: ExplainBatch['track'] | null;
      trackNote?: string;
    }
  | { type: 'session/restore'; snapshot: SessionSnapshot }
  | { type: 'session/reset' }
  | { type: 'slide/goto'; slide: number }
  | { type: 'deck/pages'; totalSlides: number }
  | { type: 'style/set'; style: StudyStyle }
  | { type: 'instructions/set'; value: string }
  | { type: 'explain/start'; from: number }
  | { type: 'explain/success'; batch: ExplainBatch }
  | { type: 'explain/failure'; error: FailureInfo }
  | { type: 'explain/idle' }
  | { type: 'notes/clear' }
  | { type: 'warnings/dismiss' }
  | { type: 'chat/send'; message: ChatMessage }
  | { type: 'chat/reply'; message: ChatMessage }
  | { type: 'chat/failure'; slide: number; messageId: string; error: FailureInfo }
  | { type: 'chat/retry'; slide: number; messageId: string }
  | { type: 'chat/clear'; slide: number }
  | { type: 'practice/start'; append: boolean; total: number; from: number; to: number }
  | { type: 'practice/window'; from: number; to: number }
  | { type: 'practice/waiting'; untilMs: number }
  | { type: 'practice/chunk'; items: PracticeItem[]; done: number }
  | { type: 'practice/done'; warning?: string | null }
  | { type: 'practice/notice'; warning: string | null }
  | { type: 'practice/failure'; error: FailureInfo }
  | { type: 'practice/answer'; id: string; value: number | boolean }
  | { type: 'practice/reset' }
  | { type: 'quiz/answer'; id: string; index: number }
  | { type: 'item/complete'; id: string }
  | { type: 'progress/reset'; slide: number };

function touch(state: StudyState): StudyState {
  return { ...state, updatedAt: Date.now() };
}

function noteMap(notes: SlideNote[]): Record<number, SlideNote> {
  const map: Record<number, SlideNote> = {};
  for (const note of notes) map[note.slide] = note;
  return map;
}

/** What makes two review items "the same question" to a reader. */
function practiceFingerprint(item: PracticeItem): string {
  const flatten = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (item.kind === 'quiz') return `q:${flatten(item.question)}`;
  if (item.kind === 'match') return `m:${item.pairs.map((pair) => flatten(pair.concept)).sort().join('|')}`;
  return `c:${flatten(item.answer)}:${flatten(item.before).slice(0, 48)}`;
}

/**
 * Items arrive one slide window at a time, each numbered from zero by the
 * server, and windows can overlap on content. Collapse the exact repeats and
 * make every id unique, because ids are what answers are keyed by.
 */
export function dedupePractice(items: PracticeItem[]): PracticeItem[] {
  const seenIds = new Set<string>();
  const seenText = new Set<string>();
  const out: PracticeItem[] = [];

  for (const item of items) {
    const fingerprint = practiceFingerprint(item);
    if (seenText.has(fingerprint)) continue;
    seenText.add(fingerprint);

    let id = item.id;
    let suffix = 0;
    while (seenIds.has(id)) {
      suffix += 1;
      id = `${item.id}-${suffix}`;
    }
    seenIds.add(id);
    out.push(id === item.id ? item : { ...item, id });
  }

  return out;
}

export function studyReducer(state: StudyState, action: StudyAction): StudyState {
  switch (action.type) {
    case 'session/open':
      return touch({
        ...emptyState,
        id: action.id,
        source: action.source,
        totalSlides: action.totalSlides,
        currentSlide: 1,
        style: action.style,
        customInstructions: action.customInstructions,
        isDemo: action.isDemo ?? false,
        notes: action.notes ? noteMap(action.notes) : {},
        track: action.track ?? null,
        trackNote: action.trackNote ?? '',
      });

    case 'session/restore': {
      const snapshot = action.snapshot;
      const chat: Record<number, ChatMessage[]> = {};
      for (const message of snapshot.chat ?? []) {
        chat[message.slide] = [...(chat[message.slide] ?? []), message];
      }
      return {
        ...emptyState,
        id: snapshot.id,
        source: { base64: snapshot.base64, name: snapshot.name, bytes: snapshot.bytes },
        totalSlides: snapshot.totalSlides,
        currentSlide: Math.min(Math.max(1, snapshot.currentSlide || 1), Math.max(1, snapshot.totalSlides)),
        style: snapshot.style,
        customInstructions: snapshot.customInstructions ?? '',
        track: snapshot.track ?? null,
        trackNote: snapshot.trackNote ?? '',
        notes: noteMap(snapshot.notes ?? []),
        chat,
        practice: {
          items: snapshot.practiceItems ?? [],
          status: 'idle',
          error: null,
          warning: null,
          answers: snapshot.practiceAnswers ?? {},
          generatedAt: snapshot.practiceItems?.length ? snapshot.updatedAt : null,
          extended: Boolean(snapshot.practiceExtended),
          progress: null,
              },
        quizAnswers: snapshot.quizAnswers ?? {},
        completed: snapshot.completed ?? {},
        isDemo: Boolean(snapshot.isDemo),
        updatedAt: snapshot.updatedAt,
      };
    }

    case 'session/reset':
      return { ...emptyState };

    case 'slide/goto': {
      const max = Math.max(1, state.totalSlides || 1);
      const slide = Math.min(max, Math.max(1, action.slide));
      if (slide === state.currentSlide) return state;
      return { ...state, currentSlide: slide };
    }

    case 'deck/pages': {
      if (action.totalSlides === state.totalSlides || action.totalSlides < 1) return state;
      return {
        ...state,
        totalSlides: action.totalSlides,
        currentSlide: Math.min(state.currentSlide, action.totalSlides),
      };
    }

    case 'style/set':
      return touch({ ...state, style: action.style });

    case 'instructions/set':
      return touch({ ...state, customInstructions: action.value });

    case 'explain/start':
      return { ...state, explain: { status: 'running', from: action.from, startedAt: Date.now(), error: null } };

    case 'explain/success': {
      const batch = action.batch;
      const notes = { ...state.notes };
      for (const note of batch.notes) notes[note.slide] = note;
      return touch({
        ...state,
        notes,
        track: batch.track ?? state.track,
        trackNote: batch.trackNote || state.trackNote,
        totalSlides: batch.totalSlides && batch.totalSlides > 0 ? batch.totalSlides : state.totalSlides,
        warnings: batch.warnings.length ? batch.warnings : state.warnings,
        explain: { status: 'idle', from: null, startedAt: null, error: null },
      });
    }

    case 'explain/failure':
      return { ...state, explain: { ...state.explain, status: 'error', error: action.error } };

    case 'explain/idle':
      return { ...state, explain: { status: 'idle', from: null, startedAt: null, error: null } };

    case 'notes/clear':
      return touch({ ...state, notes: {}, warnings: [], track: null, trackNote: '' });

    case 'warnings/dismiss':
      return { ...state, warnings: [] };

    case 'chat/send': {
      const slide = action.message.slide;
      return touch({
        ...state,
        chat: { ...state.chat, [slide]: [...(state.chat[slide] ?? []), action.message] },
        chatPending: slide,
        chatError: null,
      });
    }

    case 'chat/reply': {
      const slide = action.message.slide;
      return touch({
        ...state,
        chat: { ...state.chat, [slide]: [...(state.chat[slide] ?? []), action.message] },
        chatPending: null,
        chatError: null,
      });
    }

    case 'chat/failure': {
      const messages = state.chat[action.slide] ?? [];
      return {
        ...state,
        chat: {
          ...state.chat,
          [action.slide]: messages.map((message) =>
            message.id === action.messageId ? { ...message, failed: true } : message,
          ),
        },
        chatPending: null,
        chatError: action.error,
      };
    }

    case 'chat/retry': {
      const messages = state.chat[action.slide] ?? [];
      return {
        ...state,
        chat: { ...state.chat, [action.slide]: messages.filter((message) => message.id !== action.messageId) },
        chatError: null,
      };
    }

    case 'chat/clear': {
      const chat = { ...state.chat };
      delete chat[action.slide];
      return touch({ ...state, chat, chatError: null, chatPending: null });
    }

    case 'practice/start':
      return {
        ...state,
        practice: {
          ...state.practice,
          status: 'running',
          error: null,
          warning: null,
          items: action.append ? state.practice.items : [],
          answers: action.append ? state.practice.answers : {},
          extended: action.append ? true : state.practice.extended,
          progress: { done: 0, total: Math.max(1, action.total), from: action.from, to: action.to },
        },
      };

    case 'practice/window':
      if (!state.practice.progress) return state;
      return {
        ...state,
        practice: {
          ...state.practice,
          progress: { ...state.practice.progress, from: action.from, to: action.to, waitingUntil: null },
        },
      };

    /** Holding back on purpose, so the panel can say so instead of looking stuck. */
    case 'practice/waiting':
      if (!state.practice.progress) return state;
      return {
        ...state,
        practice: { ...state.practice, progress: { ...state.practice.progress, waitingUntil: action.untilMs } },
      };

    /** One slide window landed. Items appear as they arrive, not at the end. */
    case 'practice/chunk': {
      const merged = dedupePractice([...state.practice.items, ...action.items]);
      return touch({
        ...state,
        practice: {
          ...state.practice,
          items: merged,
          error: null,
          generatedAt: Date.now(),
          progress: state.practice.progress
            ? {
                ...state.practice.progress,
                done: Math.max(state.practice.progress.done, action.done),
                waitingUntil: null,
              }
            : null,
        },
      });
    }

    case 'practice/done':
      return touch({
        ...state,
        practice: {
          ...state.practice,
          status: 'idle',
          error: null,
          warning: action.warning ?? null,
          generatedAt: state.practice.items.length ? Date.now() : state.practice.generatedAt,
          progress: null,
        },
      });

    case 'practice/notice':
      if (state.practice.warning === action.warning) return state;
      return { ...state, practice: { ...state.practice, warning: action.warning } };

    case 'practice/failure':
      return {
        ...state,
        practice: { ...state.practice, status: 'error', error: action.error, progress: null },
      };

    case 'practice/answer':
      return touch({
        ...state,
        practice: { ...state.practice, answers: { ...state.practice.answers, [action.id]: action.value } },
      });

    case 'practice/reset':
      return touch({
        ...state,
        practice: {
          items: [],
          status: 'idle',
          error: null,
          warning: null,
          answers: {},
          generatedAt: null,
          extended: false,
          progress: null,
              },
      });

    case 'quiz/answer': {
      if (state.quizAnswers[action.id] !== undefined) return state;
      return touch({ ...state, quizAnswers: { ...state.quizAnswers, [action.id]: action.index } });
    }

    case 'item/complete':
      if (state.completed[action.id]) return state;
      return touch({ ...state, completed: { ...state.completed, [action.id]: true } });

    case 'progress/reset': {
      const note = state.notes[action.slide];
      if (!note) return state;
      const quizAnswers = { ...state.quizAnswers };
      for (const question of note.quiz) delete quizAnswers[question.id];
      const completed = { ...state.completed };
      for (const set of note.matching) delete completed[set.id];
      for (const item of note.cloze) delete completed[item.id];
      return touch({ ...state, quizAnswers, completed });
    }

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* selectors                                                                   */
/* -------------------------------------------------------------------------- */

export interface SlideProgress {
  explained: boolean;
  practiceTotal: number;
  practiceDone: number;
}

export function slideProgress(state: StudyState, slide: number): SlideProgress {
  const note = state.notes[slide];
  if (!note) return { explained: false, practiceTotal: 0, practiceDone: 0 };
  let total = 0;
  let done = 0;
  for (const question of note.quiz) {
    total += 1;
    if (state.quizAnswers[question.id] !== undefined) done += 1;
  }
  for (const set of note.matching) {
    total += 1;
    if (state.completed[set.id]) done += 1;
  }
  for (const item of note.cloze) {
    total += 1;
    if (state.completed[item.id]) done += 1;
  }
  return { explained: true, practiceTotal: total, practiceDone: done };
}

export interface DeckProgress {
  explained: number;
  total: number;
  percent: number;
  practiceTotal: number;
  practiceDone: number;
  /** First slide with no explanation yet, or null when the deck is covered. */
  nextGap: number | null;
}

export function deckProgress(state: StudyState): DeckProgress {
  const total = Math.max(0, state.totalSlides);
  let explained = 0;
  let practiceTotal = 0;
  let practiceDone = 0;
  let nextGap: number | null = null;

  for (let slide = 1; slide <= total; slide += 1) {
    const progress = slideProgress(state, slide);
    if (progress.explained) {
      explained += 1;
      practiceTotal += progress.practiceTotal;
      practiceDone += progress.practiceDone;
    } else if (nextGap === null) {
      nextGap = slide;
    }
  }

  return {
    explained,
    total,
    percent: total ? (explained / total) * 100 : 0,
    practiceTotal,
    practiceDone,
    nextGap,
  };
}

export function toSnapshot(state: StudyState): SessionSnapshot | null {
  if (!state.source || !state.id) return null;
  return {
    id: state.id,
    name: state.source.name,
    base64: state.source.base64,
    bytes: state.source.bytes,
    totalSlides: state.totalSlides,
    currentSlide: state.currentSlide,
    style: state.style,
    customInstructions: state.customInstructions,
    track: state.track,
    trackNote: state.trackNote,
    notes: Object.values(state.notes).sort((a, b) => a.slide - b.slide),
    chat: Object.values(state.chat).flat().sort((a, b) => a.createdAt - b.createdAt),
    practiceItems: state.practice.items,
    practiceAnswers: state.practice.answers,
    practiceExtended: state.practice.extended,
    quizAnswers: state.quizAnswers,
    completed: state.completed,
    isDemo: state.isDemo,
    updatedAt: state.updatedAt || Date.now(),
  };
}
