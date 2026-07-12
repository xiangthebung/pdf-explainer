export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface SlideExplanation {
  slideNumber: number;
  explanation: string;
  quizQuestions?: QuizQuestion[];
}

export interface ExplanationResponse {
  startSlide: number;
  endSlide: number;
  explanations: SlideExplanation[];
  detectedClassType?: "logic" | "non-logic";
  detectedClassTypeExplanation?: string;
  totalSlides?: number;
}
