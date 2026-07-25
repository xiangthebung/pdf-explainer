export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface MatchingGame {
  concept: string;
  definition: string;
}

export interface FillInBlank {
  sentenceBefore: string;
  blankWord: string;
  sentenceAfter: string;
}

export interface ExampleProblem {
  problem: string;
  steps: string[];
  finalAnswer: string;
}

export interface ContentBlock {
  type: "markdown" | "callout";
  content: string;
  calloutType?: string;
}

export interface SlideExplanation {
  slideNumber: number;
  blocks: ContentBlock[];
  quizQuestions?: QuizQuestion[];
  matchingGames?: MatchingGame[];
  fillInBlanks?: FillInBlank[];
  exampleProblem?: ExampleProblem;
}

export interface ExplanationResponse {
  startSlide: number;
  endSlide: number;
  explanations: SlideExplanation[];
  detectedClassType?: "logic" | "non-logic";
  detectedClassTypeExplanation?: string;
  totalSlides?: number;
}
