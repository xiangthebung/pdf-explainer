import { describe, expect, it } from 'vitest';
import type { ChatMessage, PracticeItem, SlideNote } from '../shared/types';
import { buildMarkdownExport } from '../src/lib/export';

const notes: SlideNote[] = [
  {
    slide: 2,
    summary: 'Time of flight',
    blocks: [
      { type: 'markdown', content: 'Distance is $d = c\\Delta t$.' },
      { type: 'callout', callout: 'memory', content: 'One nanosecond is 30 cm.' },
    ],
    quiz: [
      {
        id: 's2-q0',
        slide: 2,
        question: 'How big is a 1 microsecond error?',
        options: ['300 m', '3 m'],
        correctIndex: 0,
        explanation: 'Light travels 300 m in a microsecond.',
      },
    ],
    matching: [
      {
        id: 's2-m0',
        slide: 2,
        title: 'Match the layers',
        pairs: [{ concept: 'Ionosphere', definition: 'Charged particles' }],
      },
    ],
    cloze: [{ id: 's2-c0', slide: 2, before: 'Signals travel at', answer: 'the speed of light', after: 'in a vacuum.' }],
    worked: { problem: 'Find d', steps: ['d = ct', 'substitute'], answer: '21,000 km' },
  },
  {
    slide: 1,
    summary: 'Overview',
    blocks: [{ type: 'markdown', content: 'A constellation of satellites.' }],
    quiz: [],
    matching: [],
    cloze: [],
    worked: null,
  },
];

const practice: PracticeItem[] = [
  {
    kind: 'quiz',
    id: 'p0',
    slide: 4,
    question: 'Which band is civilian?',
    options: ['L1', 'L5'],
    correctIndex: 0,
    explanation: 'L1 carries the civilian signal.',
  },
];

const chat: ChatMessage[] = [
  { id: 'm1', role: 'user', text: 'Why four satellites?', slide: 4, createdAt: 1 },
  { id: 'm2', role: 'assistant', text: 'To solve for the clock offset too.', slide: 4, createdAt: 2 },
];

const base = {
  deckName: 'How GPS works',
  totalSlides: 10,
  trackNote: 'Quantitative deck',
  notes,
  practice,
  chat,
  now: new Date('2026-03-04T10:00:00Z'),
};

describe('buildMarkdownExport', () => {
  it('writes a document in slide order with the maths intact', () => {
    const output = buildMarkdownExport({ ...base, includePractice: false, includeChat: false });
    expect(output.indexOf('## Slide 1')).toBeLessThan(output.indexOf('## Slide 2'));
    expect(output).toContain('# How GPS works');
    expect(output).toContain('2 of 10 slides explained');
    expect(output).toContain('$d = c\\Delta t$');
    expect(output).toContain('> **Memory hook**');
  });

  it('includes worked examples regardless of the practice toggle', () => {
    const output = buildMarkdownExport({ ...base, includePractice: false, includeChat: false });
    expect(output).toContain('### Worked example');
    expect(output).toContain('1. d = ct');
    expect(output).toContain('**Answer:** 21,000 km');
  });

  it('marks the correct answer and renders matching as a table when practice is included', () => {
    const output = buildMarkdownExport({ ...base, includePractice: true, includeChat: false });
    expect(output).toContain('- A. 300 m  ✓');
    expect(output).toContain('| Term | Definition |');
    expect(output).toContain('**the speed of light**');
    expect(output).toContain('## Deck review');
    expect(output).toContain('_(slide 4)_');
  });

  it('leaves practice and chat out when asked to', () => {
    const output = buildMarkdownExport({ ...base, includePractice: false, includeChat: false });
    expect(output).not.toContain('## Deck review');
    expect(output).not.toContain('Questions you asked');
    expect(output).not.toContain('300 m  ✓');
  });

  it('adds conversations grouped by slide', () => {
    const output = buildMarkdownExport({ ...base, includePractice: false, includeChat: true });
    expect(output).toContain('## Questions you asked');
    expect(output).toContain('### Slide 4');
    expect(output).toContain('**You:** Why four satellites?');
    expect(output).toContain('**Tutor:** To solve for the clock offset too.');
  });

  it('produces a valid document even with no notes', () => {
    const output = buildMarkdownExport({
      ...base,
      notes: [],
      practice: [],
      chat: [],
      includePractice: true,
      includeChat: true,
    });
    expect(output).toContain('# How GPS works');
    expect(output).toContain('0 of 10 slides explained');
    expect(output.endsWith('\n')).toBe(true);
  });
});
