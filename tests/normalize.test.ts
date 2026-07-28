import { describe, expect, it } from 'vitest';
import {
  cleanText,
  cleanMatchingTitle,
  extractPairs,
  normalizeCloze,
  normalizeExplainBatch,
  normalizePracticeSet,
  shuffleQuizOptions,
  stripOptionLabel,
} from '../shared/normalize';

const ctx = { requestedFrom: 1, totalSlides: 10 };

describe('cleanText', () => {
  it('strips control characters and normalises newlines', () => {
    expect(cleanText('a\u0000b\r\nc')).toBe('ab\nc');
  });

  it('coerces numbers and rejects objects', () => {
    expect(cleanText(42)).toBe('42');
    expect(cleanText({ a: 1 })).toBe('');
  });

  it('caps runaway output', () => {
    expect(cleanText('x'.repeat(50), 10).length).toBeLessThanOrEqual(11);
  });
});

describe('stripOptionLabel', () => {
  it('removes the label prefixes models add anyway', () => {
    expect(stripOptionLabel('A) Because it is passive')).toBe('Because it is passive');
    expect(stripOptionLabel('b. Second option')).toBe('Second option');
    expect(stripOptionLabel('(3) Third option')).toBe('Third option');
    expect(stripOptionLabel('- Fourth option')).toBe('Fourth option');
  });

  it('leaves real content alone', () => {
    expect(stripOptionLabel('A(t) is the amplitude')).toBe('A(t) is the amplitude');
  });
});

describe('normalizeExplainBatch', () => {
  it('accepts string slide numbers, string blocks and unknown callout labels', () => {
    const batch = normalizeExplainBatch(
      {
        startSlide: '1',
        endSlide: '2',
        totalSlides: '10',
        detectedClassType: 'logic',
        explanations: [
          { slideNumber: '1', blocks: 'Just a paragraph', summary: 'Title slide' },
          {
            slideNumber: 2,
            blocks: [
              { type: 'callout', calloutType: 'Remember this', content: 'Mnemonic' },
              { type: 'markdown', content: 'Body' },
            ],
          },
        ],
      },
      ctx,
    );

    expect(batch.notes).toHaveLength(2);
    expect(batch.notes[0].blocks[0]).toEqual({ type: 'markdown', content: 'Just a paragraph' });
    expect(batch.notes[0].summary).toBe('Title slide');
    expect(batch.notes[1].blocks[0]).toMatchObject({ type: 'callout', callout: 'memory' });
    expect(batch.track).toBe('quantitative');
    expect(batch.from).toBe(1);
    expect(batch.to).toBe(2);
  });

  it('drops out-of-range slides and merges duplicates', () => {
    const batch = normalizeExplainBatch(
      {
        explanations: [
          { slideNumber: 99, blocks: 'Beyond the deck' },
          { slideNumber: 0, blocks: 'Before the deck' },
          { slideNumber: 3, blocks: 'First half' },
          { slideNumber: 3, blocks: 'Second half' },
        ],
      },
      { requestedFrom: 3, totalSlides: 10 },
    );

    expect(batch.notes).toHaveLength(1);
    expect(batch.notes[0].slide).toBe(3);
    expect(batch.notes[0].blocks).toHaveLength(2);
    expect(batch.warnings.join(' ')).toMatch(/out-of-range/i);
    expect(batch.warnings.join(' ')).toMatch(/merged/i);
  });

  it('promotes a leading heading into the summary and removes the duplicate', () => {
    const batch = normalizeExplainBatch(
      {
        explanations: [
          { slideNumber: 1, blocks: [{ type: 'markdown', content: '### Time of Flight\n\nDistance is speed times time.' }] },
        ],
      },
      ctx,
    );
    expect(batch.notes[0].summary).toBe('Time of Flight');
    expect(batch.notes[0].blocks[0].content).toBe('Distance is speed times time.');
  });

  it('keeps an explicit summary and leaves the body alone', () => {
    const batch = normalizeExplainBatch(
      {
        explanations: [
          { slideNumber: 1, summary: 'Given headline', blocks: [{ type: 'markdown', content: '### Body heading\n\nText.' }] },
        ],
      },
      ctx,
    );
    expect(batch.notes[0].summary).toBe('Given headline');
    expect(batch.notes[0].blocks[0].content).toContain('### Body heading');
  });

  it('does not drop a note whose only content was its heading', () => {
    const batch = normalizeExplainBatch(
      { explanations: [{ slideNumber: 1, blocks: [{ type: 'markdown', content: '## Section divider' }] }] },
      ctx,
    );
    expect(batch.notes).toHaveLength(1);
    expect(batch.notes[0].summary).toBe('Section divider');
    expect(batch.notes[0].blocks).toHaveLength(0);
  });

  it('never returns an entry with nothing usable', () => {
    const batch = normalizeExplainBatch({ explanations: [{ slideNumber: 1, blocks: [{ type: 'markdown', content: '   ' }] }] }, ctx);
    expect(batch.notes).toHaveLength(0);
    expect(batch.warnings.join(' ')).toMatch(/nothing usable/i);
  });

  it('repairs quiz options and validates the answer index', () => {
    const batch = normalizeExplainBatch(
      {
        explanations: [
          {
            slideNumber: 1,
            blocks: 'Body',
            quizQuestions: [
              {
                question: 'Which is right?',
                options: ['A) Correct answer', 'B) Wrong one', 'C) Wrong one'],
                explanation: 'Because.',
              },
              { question: 'Bad index', options: ['one', 'two'], correctIndex: 7 },
              { question: 'Too few options', options: ['only'] },
            ],
          },
        ],
      },
      ctx,
    );

    const quiz = batch.notes[0].quiz;
    expect(quiz).toHaveLength(1);
    // Duplicate distractors collapse, letter prefixes go, and a missing index
    // falls back to the documented "correct answer first" contract.
    expect(quiz[0].options).toEqual(['Correct answer', 'Wrong one']);
    expect(quiz[0].correctIndex).toBe(0);
    expect(quiz[0].id).toBe('s1-q0');
    expect(batch.warnings.some((warning) => /out-of-range answer/.test(warning))).toBe(true);
  });

  it('keeps the correct option when duplicates trim the list', () => {
    const batch = normalizeExplainBatch(
      {
        explanations: [
          {
            slideNumber: 1,
            blocks: 'Body',
            quizQuestions: [
              { question: 'Q', options: ['same', 'same', 'other'], correctIndex: 2, explanation: '' },
            ],
          },
        ],
      },
      ctx,
    );
    const question = batch.notes[0].quiz[0];
    expect(question.options[question.correctIndex]).toBe('other');
  });

  it('treats a flat pair list as one matching game and drops thin ones', () => {
    const batch = normalizeExplainBatch(
      {
        explanations: [
          {
            slideNumber: 1,
            blocks: 'Body',
            matchingGames: [
              { concept: 'Ionosphere', definition: 'Charged layer that slows the signal' },
              { concept: 'Troposphere', definition: 'Weather layer that delays it' },
            ],
          },
          {
            slideNumber: 2,
            blocks: 'Body',
            matchingGames: [{ concept: 'Alone', definition: 'Only one pair' }],
          },
        ],
      },
      ctx,
    );

    expect(batch.notes[0].matching).toHaveLength(1);
    expect(batch.notes[0].matching[0].pairs).toHaveLength(2);
    expect(batch.notes[1].matching).toHaveLength(0);
  });

  it('recovers a worked example and ignores an incomplete one', () => {
    const batch = normalizeExplainBatch(
      {
        explanations: [
          {
            slideNumber: 1,
            blocks: 'Body',
            exampleProblem: { problem: 'Compute d', steps: ['d = ct', 'substitute'], finalAnswer: '20 km' },
          },
          { slideNumber: 2, blocks: 'Body', exampleProblem: { problem: 'No steps', steps: [] } },
        ],
      },
      ctx,
    );

    expect(batch.notes[0].worked).toEqual({ problem: 'Compute d', steps: ['d = ct', 'substitute'], answer: '20 km' });
    expect(batch.notes[1].worked).toBeNull();
  });

  it('survives complete garbage', () => {
    for (const input of [null, undefined, 42, 'nope', [], { explanations: 'not an array' }]) {
      const batch = normalizeExplainBatch(input, ctx);
      expect(batch.notes).toEqual([]);
      expect(batch.track).toBe('mixed');
    }
  });
});

describe('extractPairs', () => {
  it('reads an object map', () => {
    expect(extractPairs({ pairs: { L1: '1575.42 MHz', L2: '1227.60 MHz' } })).toEqual([
      { concept: 'L1', definition: '1575.42 MHz' },
      { concept: 'L2', definition: '1227.60 MHz' },
    ]);
  });

  it('reads "Term: definition" lines', () => {
    expect(extractPairs({ pairs: ['RTK: carrier phase tracking', 'DGPS — reference station corrections'] })).toEqual([
      { concept: 'RTK', definition: 'carrier phase tracking' },
      { concept: 'DGPS', definition: 'reference station corrections' },
    ]);
  });

  it('rejects ambiguous pairs with duplicate definitions', () => {
    const pairs = extractPairs({
      pairs: [
        { concept: 'A', definition: 'same' },
        { concept: 'B', definition: 'same' },
      ],
    });
    expect(pairs).toHaveLength(1);
  });

  it('caps the number of pairs so the game stays playable', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ concept: `c${index}`, definition: `d${index}` }));
    expect(extractPairs({ pairs: many })).toHaveLength(6);
  });
});

describe('cleanMatchingTitle', () => {
  it('strips serialised JSON that leaked into the title', () => {
    expect(cleanMatchingTitle('Match the bands", "pairs": [{"concept":"L1"}]')).toBe('Match the bands');
  });

  it('falls back to a sensible instruction', () => {
    expect(cleanMatchingTitle('')).toBe('Match each term to its definition');
  });
});

describe('normalizeCloze', () => {
  it('splits a single sentence around a bracketed answer', () => {
    expect(normalizeCloze({ sentence: 'Signals slow in the [ionosphere] on the way down.' }, 4, 'c1')).toEqual({
      id: 'c1',
      slide: 4,
      before: 'Signals slow in the',
      answer: 'ionosphere',
      after: 'on the way down.',
    });
  });

  it('recovers an answer left inside the prefix as a marker', () => {
    const item = normalizeCloze(
      { sentenceBefore: 'A receiver needs [four] satellites', blankWord: '', sentenceAfter: 'for a 3D fix.' },
      1,
      'c2',
    );
    expect(item?.answer).toBe('four');
    expect(item?.before).not.toMatch(/\[/);
  });

  it('removes leftover underscores from the sentence', () => {
    const item = normalizeCloze({ sentenceBefore: 'The L1 band is ____', blankWord: '1575.42 MHz', sentenceAfter: '.' }, 1, 'c3');
    expect(item?.before).toBe('The L1 band is');
    expect(item?.answer).toBe('1575.42 MHz');
  });

  it('drops items with no recoverable answer', () => {
    expect(normalizeCloze({ sentenceBefore: 'Nothing here', blankWord: 'blank', sentenceAfter: '' }, 1, 'c4')).toBeNull();
    expect(normalizeCloze({}, 1, 'c5')).toBeNull();
  });
});

describe('normalizePracticeSet', () => {
  it('infers the item type when the model omits it', () => {
    const set = normalizePracticeSet(
      {
        puzzles: [
          { sourceSlideNumber: 2, question: 'Pick one', options: ['right', 'wrong'], correctIndex: 0, explanation: 'x' },
          {
            sourceSlideNumber: 3,
            pairs: [
              { concept: 'L1', definition: 'Civilian carrier at 1575.42 MHz' },
              { concept: 'L2', definition: 'Second carrier at 1227.60 MHz' },
            ],
          },
          { sourceSlideNumber: 4, sentenceBefore: 'The answer is', blankWord: 'this', sentenceAfter: 'here' },
        ],
      },
      10,
    );

    expect(set.items.map((item) => item.kind)).toEqual(['quiz', 'match', 'cloze']);
    expect(set.items[0].id).toBe('p0');
  });

  it('parses matching pairs that were serialised into the title', () => {
    const set = normalizePracticeSet(
      {
        puzzles: [
          {
            type: 'matching',
            sourceSlideNumber: 5,
            title: 'Match the systems {"pairs":[{"concept":"GPS","definition":"United States"},{"concept":"Galileo","definition":"European Union"}]}',
          },
        ],
      },
      10,
    );

    expect(set.items).toHaveLength(1);
    const item = set.items[0];
    expect(item.kind).toBe('match');
    if (item.kind === 'match') {
      expect(item.pairs).toHaveLength(2);
      expect(item.title).toBe('Match the systems');
    }
  });

  it('zeroes slide references outside the deck instead of dropping the item', () => {
    const set = normalizePracticeSet(
      { puzzles: [{ type: 'blank', sourceSlideNumber: 900, sentenceBefore: 'A', blankWord: 'b', sentenceAfter: 'C' }] },
      10,
    );
    expect(set.items[0].slide).toBe(0);
  });
});

describe('shuffleQuizOptions', () => {
  it('follows the correct answer wherever it lands', () => {
    const question = { options: ['right', 'a', 'b', 'c'], correctIndex: 0 };
    let sequence = 0;
    const rng = () => [0.9, 0.1, 0.7, 0.3][sequence++ % 4];
    const shuffled = shuffleQuizOptions(question, rng);
    expect(shuffled.options).toHaveLength(4);
    expect(shuffled.options[shuffled.correctIndex]).toBe('right');
    expect([...shuffled.options].sort()).toEqual(['a', 'b', 'c', 'right']);
  });
});

describe('normalizePracticeSet shapes', () => {
  it('reads the split arrays the schema asks for and walks the deck in order', () => {
    const set = normalizePracticeSet(
      {
        quizzes: [
          {
            sourceSlideNumber: 7,
            question: 'What does the draft model do?',
            options: ['Proposes tokens', 'Trains the target', 'Stores the cache'],
            correctIndex: 0,
            explanation: 'It proposes candidate tokens for verification.',
          },
        ],
        matchings: [
          {
            sourceSlideNumber: 3,
            title: 'Match each term to its meaning',
            pairs: [
              { concept: 'Draft model', definition: 'Small model that proposes tokens' },
              { concept: 'Target model', definition: 'Large model that verifies tokens' },
              { concept: 'Acceptance rate', definition: 'Share of proposals kept' },
            ],
          },
        ],
        blanks: [
          {
            sourceSlideNumber: 5,
            sentenceBefore: 'Speculative decoding needs a',
            blankWord: 'draft model',
            sentenceAfter: 'to propose tokens.',
          },
        ],
      },
      42,
    );

    expect(set.items.map((item) => [item.slide, item.kind])).toEqual([
      [3, 'match'],
      [5, 'cloze'],
      [7, 'quiz'],
    ]);
    expect(set.items.every((item) => item.id.length > 0)).toBe(true);
    expect(new Set(set.items.map((item) => item.id)).size).toBe(3);
  });

  it('still accepts one flat puzzles array, declared type winning over shape', () => {
    const set = normalizePracticeSet(
      {
        puzzles: [
          {
            type: 'blank',
            sourceSlideNumber: 2,
            sentenceBefore: 'The ionosphere delays the',
            blankWord: 'signal',
            sentenceAfter: 'as it passes through.',
          },
        ],
      },
      10,
    );
    expect(set.items).toHaveLength(1);
    expect(set.items[0].kind).toBe('cloze');
  });

  it('skips items it cannot use and says so, rather than rendering blanks', () => {
    const set = normalizePracticeSet(
      {
        quizzes: [{ sourceSlideNumber: 1, question: 'Only one option?', options: ['just this'], correctIndex: 0 }],
        matchings: [{ sourceSlideNumber: 2, title: 'Too few', pairs: [{ concept: 'a', definition: 'b' }] }],
        blanks: [{ sourceSlideNumber: 3, sentenceBefore: 'No answer here', blankWord: '   ', sentenceAfter: '.' }],
      },
      10,
    );
    expect(set.items).toHaveLength(0);
    expect(set.warnings.length).toBeGreaterThan(0);
  });
});
