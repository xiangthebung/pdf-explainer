import { Type } from '@google/genai';

/**
 * Response schemas handed to Gemini. They are a strong hint, not a guarantee —
 * everything still goes through `shared/normalize.ts` afterwards.
 */

const quizItem = {
  type: Type.OBJECT,
  properties: {
    question: { type: Type.STRING, description: 'The question. May contain inline LaTeX.' },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 or 4 options. The correct answer is first. No letter prefixes.',
    },
    correctIndex: { type: Type.INTEGER, description: 'Always 0.' },
    explanation: { type: Type.STRING, description: 'One or two sentences that teach the answer.' },
  },
  required: ['question', 'options', 'correctIndex', 'explanation'],
} as const;

const pairItem = {
  type: Type.OBJECT,
  properties: {
    concept: { type: Type.STRING, description: 'Short term or concept.' },
    definition: { type: Type.STRING, description: 'Self-contained definition that matches exactly one concept.' },
  },
  required: ['concept', 'definition'],
} as const;

const blankItem = {
  type: Type.OBJECT,
  properties: {
    sentenceBefore: { type: Type.STRING, description: 'Sentence text before the blank.' },
    blankWord: { type: Type.STRING, description: 'The missing term. Never empty.' },
    sentenceAfter: { type: Type.STRING, description: 'Sentence text after the blank.' },
  },
  required: ['sentenceBefore', 'blankWord', 'sentenceAfter'],
} as const;

export const explainSchema = {
  type: Type.OBJECT,
  properties: {
    startSlide: { type: Type.INTEGER, description: 'First slide covered in this response.' },
    endSlide: { type: Type.INTEGER, description: 'Highest slide number actually explained in this response.' },
    totalSlides: { type: Type.INTEGER, description: 'Total pages in the PDF.' },
    detectedClassType: { type: Type.STRING, description: "Exactly 'logic' or 'non-logic'." },
    detectedClassTypeExplanation: {
      type: Type.STRING,
      description: 'One sentence on the detected subject type and how the teaching adapted.',
    },
    explanations: {
      type: Type.ARRAY,
      description: 'One entry per slide covered, in ascending slide order.',
      items: {
        type: Type.OBJECT,
        properties: {
          slideNumber: { type: Type.INTEGER, description: '1-indexed slide number.' },
          summary: { type: Type.STRING, description: 'Headline of at most nine words.' },
          blocks: {
            type: Type.ARRAY,
            description: 'Ordered explanation sections.',
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "'markdown' or 'callout'." },
                content: { type: Type.STRING, description: 'Markdown content of the section.' },
                calloutType: {
                  type: Type.STRING,
                  description:
                    "Required when type is 'callout'. One of: 'Key Concept', 'Intuition', 'Memory Hook', 'Real-World Example', 'Architecture Walkthrough', 'Watch Out'.",
                },
              },
              required: ['type', 'content'],
            },
          },
          quizQuestions: {
            type: Type.ARRAY,
            description:
              '1-3 multiple choice questions for a slide that teaches something. Empty array only for title, agenda or thank-you slides.',
            items: quizItem,
          },
          matchingGames: {
            type: Type.ARRAY,
            description: 'Concept/definition pairs for a matching game. Empty unless the slide has confusable terms.',
            items: pairItem,
          },
          fillInBlanks: {
            type: Type.ARRAY,
            description: '1-2 fill-in-the-blank items for a slide that teaches something, otherwise an empty array.',
            items: blankItem,
          },
          exampleProblem: {
            type: Type.OBJECT,
            description: 'Only for slides with a calculation, derivation, algorithm or matrix.',
            properties: {
              problem: { type: Type.STRING },
              steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3-5 steps.' },
              finalAnswer: { type: Type.STRING },
            },
            required: ['problem', 'steps', 'finalAnswer'],
          },
        },
        // The practice arrays are required so a terse model cannot skip the
        // whole "check yourself" half of the product by omitting the keys. An
        // empty array is still a valid answer for a title slide.
        required: ['slideNumber', 'summary', 'blocks', 'quizQuestions', 'fillInBlanks'],
      },
    },
  },
  required: ['startSlide', 'endSlide', 'totalSlides', 'detectedClassType', 'explanations'],
} as const;

const slideNumber = {
  type: Type.INTEGER,
  description: '1-indexed slide this item came from.',
} as const;

/**
 * One array per item type, not one array of "anything".
 *
 * A single flat item schema with every field on it (question, options, title,
 * pairs, sentenceBefore…) is a trap: asked for a quiz, the model still tries to
 * fill `title`, and a lite model handed an irrelevant field will happily repeat
 * the same phrase until it hits the output ceiling. Splitting by type means each
 * item only ever sees fields it needs.
 */
export const practiceSchema = {
  type: Type.OBJECT,
  properties: {
    quizzes: {
      type: Type.ARRAY,
      description: 'Multiple choice items, in slide order.',
      items: {
        type: Type.OBJECT,
        properties: {
          sourceSlideNumber: slideNumber,
          question: { type: Type.STRING, description: 'The question. May contain inline LaTeX.' },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 or 4 options, correct answer first, no letter prefixes.',
          },
          correctIndex: { type: Type.INTEGER, description: 'Always 0.' },
          explanation: { type: Type.STRING, description: 'One or two sentences that teach the answer.' },
        },
        required: ['sourceSlideNumber', 'question', 'options', 'correctIndex', 'explanation'],
      },
    },
    matchings: {
      type: Type.ARRAY,
      description: 'Matching sets. Leave empty unless a slide has genuinely confusable terms.',
      items: {
        type: Type.OBJECT,
        properties: {
          sourceSlideNumber: slideNumber,
          title: { type: Type.STRING, description: 'Short instruction of at most twelve words.' },
          pairs: { type: Type.ARRAY, items: pairItem, description: '3-5 pairs.' },
        },
        required: ['sourceSlideNumber', 'title', 'pairs'],
      },
    },
    blanks: {
      type: Type.ARRAY,
      description: 'Fill-in-the-blank items, in slide order.',
      items: {
        type: Type.OBJECT,
        properties: {
          sourceSlideNumber: slideNumber,
          sentenceBefore: { type: Type.STRING, description: 'Sentence text before the blank.' },
          blankWord: { type: Type.STRING, description: 'The missing term. Never empty.' },
          sentenceAfter: { type: Type.STRING, description: 'Sentence text after the blank.' },
        },
        required: ['sourceSlideNumber', 'sentenceBefore', 'blankWord', 'sentenceAfter'],
      },
    },
  },
  required: ['quizzes', 'matchings', 'blanks'],
} as const;
