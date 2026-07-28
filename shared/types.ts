/**
 * Domain types shared by the browser app and the API server.
 *
 * These are the *validated* shapes. Anything that arrives from the model is
 * untrusted and must go through `shared/normalize.ts` before it is allowed to
 * become one of these types.
 */

export const CALLOUT_KINDS = ['concept', 'intuition', 'memory', 'example', 'walkthrough', 'watchout'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export interface MarkdownBlock {
  type: 'markdown';
  content: string;
}

export interface CalloutBlock {
  type: 'callout';
  callout: CalloutKind;
  content: string;
}

export type ContentBlock = MarkdownBlock | CalloutBlock;

export interface QuizQuestion {
  id: string;
  slide: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface MatchingPair {
  concept: string;
  definition: string;
}

export interface MatchingSet {
  id: string;
  slide: number;
  title: string;
  pairs: MatchingPair[];
}

export interface ClozeItem {
  id: string;
  slide: number;
  before: string;
  answer: string;
  after: string;
}

export interface WorkedExample {
  problem: string;
  steps: string[];
  answer: string;
}

export interface SlideNote {
  slide: number;
  summary: string;
  blocks: ContentBlock[];
  quiz: QuizQuestion[];
  matching: MatchingSet[];
  cloze: ClozeItem[];
  worked: WorkedExample | null;
}

export type DeckTrack = 'quantitative' | 'conceptual' | 'mixed';

export interface ExplainBatch {
  /** Slide the client asked us to start from. */
  requestedFrom: number;
  /** First slide actually covered. */
  from: number;
  /** Last slide actually covered. */
  to: number;
  totalSlides: number | null;
  track: DeckTrack;
  trackNote: string;
  notes: SlideNote[];
  /** Human-readable notes about anything repaired or dropped. */
  warnings: string[];
}

export type PracticeItem =
  | ({ kind: 'quiz' } & QuizQuestion)
  | ({ kind: 'match' } & MatchingSet)
  | ({ kind: 'cloze' } & ClozeItem);

export interface PracticeSet {
  items: PracticeItem[];
  warnings: string[];
}

export type StudyStyle = 'auto' | 'deep' | 'memorable' | 'cram';

export interface StudyStyleOption {
  id: StudyStyle;
  label: string;
  description: string;
}

export const STUDY_STYLES: StudyStyleOption[] = [
  { id: 'auto', label: 'Balanced', description: 'Reads the deck and adapts. A good default.' },
  { id: 'deep', label: 'First principles', description: 'Derivations, why-it-works, worked examples.' },
  { id: 'memorable', label: 'Memory hooks', description: 'Analogies and mnemonics that stick.' },
  { id: 'cram', label: 'Cram', description: 'Tight summaries and heavy recall practice.' },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  slide: number;
  createdAt: number;
  /** Set when the assistant turn failed, so the UI can offer a retry. */
  failed?: boolean;
}

export interface ServerConfig {
  hasServerKey: boolean;
  requireUserKey: boolean;
  models: ModelOption[];
  maxUploadMb: number;
}

export interface ModelOption {
  id: string;
  label: string;
  note: string;
  /**
   * Free-tier requests per minute. Work that needs several requests is planned
   * around this so a low-limit model does not get rate-limited half way.
   */
  requestsPerMinute: number;
}

/** Payload contracts for the API surface. */
export interface ExplainRequest {
  pdfBase64: string;
  startSlide: number;
  totalSlides: number;
  style: StudyStyle;
  customInstructions?: string;
  model?: string;
  apiKey?: string;
}

export interface PracticeRequest {
  pdfBase64: string;
  totalSlides: number;
  /** Slide window for this request. The client walks the deck in windows. */
  fromSlide?: number;
  toSlide?: number;
  /** How many items to aim for in this window. */
  targetCount?: number;
  model?: string;
  apiKey?: string;
  /** Already-generated items, so a second pass can fill the gaps. */
  existing?: { kind: string; slide: number; label: string }[];
}

export interface ChatRequest {
  slide: number;
  slideText?: string;
  noteText?: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  message: string;
  model?: string;
  apiKey?: string;
}

export interface ChatResponse {
  reply: string;
}

export interface ApiErrorBody {
  error: string;
  /** Stable code so the UI can pick the right recovery affordance. */
  code: ApiErrorCode;
  retryable: boolean;
}

export type ApiErrorCode =
  | 'missing_key'
  | 'invalid_key'
  | 'quota'
  | 'bad_request'
  | 'too_large'
  | 'model_unavailable'
  | 'unparseable'
  | 'empty_result'
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'server';
