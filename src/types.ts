export interface SlideExplanation {
  slideNumber: number;
  explanation: string;
}

export interface ExplanationResponse {
  startSlide: number;
  endSlide: number;
  explanations: SlideExplanation[];
  detectedClassType?: "logic" | "non-logic";
  detectedClassTypeExplanation?: string;
  totalSlides?: number;
}
