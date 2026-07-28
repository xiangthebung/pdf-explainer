import type {
  ChatMessage,
  DeckTrack,
  PracticeItem,
  SlideNote,
  StudyStyle,
} from '~shared/types';
import type { ApiErrorCode } from '~shared/types';

export interface FailureInfo {
  message: string;
  code: ApiErrorCode;
  retryable: boolean;
}

export type JobStatus = 'idle' | 'running' | 'error';

export interface ExplainJob {
  status: JobStatus;
  /** Slide the running (or failed) batch started from. */
  from: number | null;
  startedAt: number | null;
  error: FailureInfo | null;
}

/** Where a chunked run has got to, so the panel can show honest progress. */
export interface PracticeProgress {
  /** Slide windows finished so far. */
  done: number;
  total: number;
  /** Window currently in flight. */
  from: number;
  to: number;
  /** Set while holding back to stay inside the model's rate limit. */
  waitingUntil?: number | null;
}

export interface PracticeState {
  items: PracticeItem[];
  status: JobStatus;
  error: FailureInfo | null;
  /** Set when part of the deck came back empty but the rest worked. */
  warning: string | null;
  /** Item id -> chosen option index (quiz) or completion flag (match/cloze). */
  answers: Record<string, number | boolean>;
  generatedAt: number | null;
  /** True once a gap-filling pass has run, so the button does not tempt loops. */
  extended: boolean;
  progress: PracticeProgress | null;
}

export interface DeckSource {
  base64: string;
  name: string;
  bytes: number;
}

export interface StudyState {
  /** Session identity, used for persistence. */
  id: string;
  source: DeckSource | null;
  totalSlides: number;
  currentSlide: number;
  style: StudyStyle;
  customInstructions: string;
  track: DeckTrack | null;
  trackNote: string;
  notes: Record<number, SlideNote>;
  /** Slides the model returned but with nothing worth showing. */
  warnings: string[];
  explain: ExplainJob;
  chat: Record<number, ChatMessage[]>;
  chatPending: number | null;
  chatError: FailureInfo | null;
  practice: PracticeState;
  /** Slide quiz answers, keyed by question id. */
  quizAnswers: Record<string, number>;
  /** Completed matching sets and cloze items, keyed by id. */
  completed: Record<string, boolean>;
  isDemo: boolean;
  updatedAt: number;
}

/** What we persist so a refresh does not lose an hour of study. */
export interface SessionSnapshot {
  id: string;
  name: string;
  base64: string;
  bytes: number;
  totalSlides: number;
  currentSlide: number;
  style: StudyStyle;
  customInstructions: string;
  track: DeckTrack | null;
  trackNote: string;
  notes: SlideNote[];
  chat: ChatMessage[];
  practiceItems: PracticeItem[];
  practiceAnswers: Record<string, number | boolean>;
  practiceExtended: boolean;
  quizAnswers: Record<string, number>;
  completed: Record<string, boolean>;
  isDemo: boolean;
  updatedAt: number;
}

export interface SessionSummary {
  id: string;
  name: string;
  totalSlides: number;
  explainedSlides: number;
  currentSlide: number;
  updatedAt: number;
  isDemo: boolean;
}
