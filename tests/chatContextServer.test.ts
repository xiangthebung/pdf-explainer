// @vitest-environment node
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The tutor's deck context and the single-slide rewrite, end to end through
 * both adapters.
 *
 * `generateText` and `generateJson` are the one seam between this server and
 * Google, so they are the one thing stubbed: everything upstream of them — body
 * parsing, bounds, prompt assembly, the Express router over a socket and the
 * Worker's `fetch` — is the real code. That is the rule this repository has
 * had to learn twice: the two adapters must be driven, not merely the core.
 */
vi.mock('../server/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/gemini')>();
  return {
    ...actual,
    generateText: vi.fn(async () => ({ text: 'A reply.', model: 'stub-model', attempts: [] })),
    generateJson: vi.fn(async (options: { systemInstruction: string }) => {
      const start = Number(/Start at slide (\d+)/.exec(options.systemInstruction)?.[1] ?? '1');
      return {
        data: {
          startSlide: start,
          endSlide: start,
          totalSlides: 8,
          detectedClassType: 'logic',
          explanations: [
            {
              slideNumber: start,
              summary: 'Rewritten',
              blocks: [{ type: 'markdown', content: 'Again, differently.' }],
              quizQuestions: [],
              fillInBlanks: [],
            },
          ],
        },
        model: 'stub-model',
        repaired: false,
        truncated: false,
      };
    }),
  };
});

import { batchBounds, dispatch, readChatContext } from '../server/api';
import { configure } from '../server/config';
import { generateJson, generateText } from '../server/gemini';
import { CHAT_CONTEXT_LIMITS, chatSystemPrompt, explainSystemPrompt } from '../server/prompts';
import { createApiRouter } from '../server/routes';
import worker from '../worker/index';

const textMock = vi.mocked(generateText);
const jsonMock = vi.mocked(generateJson);

const lastPrompt = (): string => String(textMock.mock.calls.at(-1)?.[0]?.systemInstruction ?? '');

const chatBody = {
  apiKey: 'test-key',
  slide: 3,
  message: 'How does this follow from the last slide?',
  selection: 'the learning rate must shrink',
  outline: [
    { slide: 1, title: 'Why optimisation matters' },
    { slide: 2, title: 'The update rule' },
    { slide: 3, title: 'Stochastic vs batch' },
  ],
  neighbours: [
    { slide: 2, title: 'The update rule', text: 'Each step moves against the gradient.' },
    { slide: 4, title: 'Learning rates', text: 'Too large diverges, too small crawls.' },
  ],
  history: [],
};

beforeEach(() => {
  textMock.mockClear();
  jsonMock.mockClear();
});

afterEach(() => configure({}));

describe('chatSystemPrompt', () => {
  it('quotes the highlighted passage and asks for it to be answered first', () => {
    const prompt = chatSystemPrompt({ slide: 3, selection: 'the learning rate must shrink' });
    expect(prompt).toContain('highlighted this passage on slide 3');
    expect(prompt).toContain('the learning rate must shrink');
    expect(prompt).toContain('Answer about that passage first');
  });

  it('lays out the deck outline and the neighbouring notes by slide number', () => {
    const prompt = chatSystemPrompt({ slide: 3, outline: chatBody.outline, neighbours: chatBody.neighbours });
    expect(prompt).toContain('DECK OUTLINE');
    expect(prompt).toContain('2: The update rule');
    expect(prompt).toContain('NEARBY SLIDES');
    expect(prompt).toContain('Slide 4 — Learning rates');
    expect(prompt).toContain('Too large diverges, too small crawls.');
  });

  it('says nothing about a deck it has not been shown', () => {
    const prompt = chatSystemPrompt({ slide: 3 });
    expect(prompt).not.toContain('DECK OUTLINE');
    expect(prompt).not.toContain('NEARBY SLIDES');
    expect(prompt).not.toContain('highlighted');
  });

  it('cuts every part of the context at its ceiling', () => {
    const prompt = chatSystemPrompt({
      slide: 1,
      selection: 's'.repeat(CHAT_CONTEXT_LIMITS.selectionChars + 100),
      outline: Array.from({ length: CHAT_CONTEXT_LIMITS.outlineEntries + 50 }, (_, index) => ({
        slide: index + 1,
        title: `T${index + 1}`,
      })),
      neighbours: Array.from({ length: CHAT_CONTEXT_LIMITS.neighbours + 3 }, (_, index) => ({
        slide: index + 2,
        title: `N${index + 2}`,
        text: 'n'.repeat(CHAT_CONTEXT_LIMITS.neighbourChars + 100),
      })),
    });
    expect(prompt).not.toContain('s'.repeat(CHAT_CONTEXT_LIMITS.selectionChars + 1));
    expect(prompt).toContain(`${CHAT_CONTEXT_LIMITS.outlineEntries}: T${CHAT_CONTEXT_LIMITS.outlineEntries}`);
    expect(prompt).not.toContain(`${CHAT_CONTEXT_LIMITS.outlineEntries + 1}: T`);
    expect(prompt).toContain(`Slide ${CHAT_CONTEXT_LIMITS.neighbours + 1} — N`);
    expect(prompt).not.toContain(`Slide ${CHAT_CONTEXT_LIMITS.neighbours + 2} — N`);
    expect(prompt).not.toContain('n'.repeat(CHAT_CONTEXT_LIMITS.neighbourChars + 1));
  });
});

describe('readChatContext', () => {
  it('reads well-formed context and drops what it cannot use', () => {
    const context = readChatContext(
      {
        selection: '  a phrase  ',
        outline: [{ slide: 2, title: 'Two' }, { slide: 'x', title: 'Bad' }, { slide: 3, title: '' }, 'junk'],
        neighbours: [{ slide: 1, title: 'One', text: 'Notes' }, { slide: 0, text: 'No slide' }, { slide: 4 }],
      },
      10,
    );
    expect(context.selection).toBe('a phrase');
    expect(context.outline).toEqual([{ slide: 2, title: 'Two' }]);
    expect(context.neighbours).toEqual([{ slide: 1, title: 'One', text: 'Notes' }]);
  });

  it('is empty for a body that carries none', () => {
    expect(readChatContext({}, 10)).toEqual({ selection: '', outline: [], neighbours: [] });
  });
});

describe('batchBounds', () => {
  it('lets the model choose within the usual window', () => {
    expect(batchBounds(1, 40)).toEqual({ minBatch: 3, maxBatch: 12 });
    expect(batchBounds(39, 40)).toEqual({ minBatch: 2, maxBatch: 2 });
  });

  it('narrows to one slide for a rewrite, and ignores an end before the start', () => {
    expect(batchBounds(5, 40, 5)).toEqual({ minBatch: 1, maxBatch: 1 });
    expect(batchBounds(5, 40, 7)).toEqual({ minBatch: 3, maxBatch: 3 });
    expect(batchBounds(5, 40, 2)).toEqual({ minBatch: 3, maxBatch: 12 });
  });

  it('writes a one-slide prompt without batching advice', () => {
    const single = explainSystemPrompt({ startSlide: 5, totalSlides: 40, style: 'deep', minBatch: 1, maxBatch: 1 });
    expect(single).toContain('Explain slide 5 only');
    expect(single).not.toContain('Judge by density');
    const usual = explainSystemPrompt({ startSlide: 5, totalSlides: 40, style: 'deep', minBatch: 3, maxBatch: 12 });
    expect(usual).toContain('Judge by density');
  });
});

describe('through dispatch', () => {
  it('hands the selection, outline and neighbours to the model', async () => {
    const result = await dispatch('POST', '/chat', async () => chatBody, {
      signal: new AbortController().signal,
      clientId: 'dispatch-chat',
    });
    expect(result.status).toBe(200);
    expect((result.body as { reply: string }).reply).toBe('A reply.');
    const prompt = lastPrompt();
    expect(prompt).toContain('the learning rate must shrink');
    expect(prompt).toContain('Slide 4 — Learning rates');
    expect(prompt).toContain('1: Why optimisation matters');
  });

  it('rewrites exactly one slide when asked to', async () => {
    const result = await dispatch(
      'POST',
      '/explain',
      async () => ({ apiKey: 'test-key', pdfBase64: 'A'.repeat(100), startSlide: 4, endSlide: 4, totalSlides: 8 }),
      { signal: new AbortController().signal, clientId: 'dispatch-explain' },
    );
    expect(result.status).toBe(200);
    const instruction = String(jsonMock.mock.calls.at(-1)?.[0]?.systemInstruction ?? '');
    expect(instruction).toContain('Explain slide 4 only');
    const body = result.body as { batch: { from: number; to: number; notes: { slide: number }[] } };
    expect(body.batch.notes.map((note) => note.slide)).toEqual([4]);
  });
});

describe('through the Express adapter', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api', createApiRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('carries the deck context over a real socket', async () => {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(chatBody),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { reply: string }).reply).toBe('A reply.');
    const prompt = lastPrompt();
    expect(prompt).toContain('highlighted this passage on slide 3');
    expect(prompt).toContain('Slide 2 — The update rule');
    expect(prompt).toContain('3: Stochastic vs batch');
  });
});

describe('through the Worker adapter', () => {
  const env = {
    ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) },
  };

  it('carries the deck context through fetch', async () => {
    const response = await worker.fetch(
      new Request('https://pdf-explainer.example/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
        body: JSON.stringify(chatBody),
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(((await response.json()) as { reply: string }).reply).toBe('A reply.');
    const prompt = lastPrompt();
    expect(prompt).toContain('the learning rate must shrink');
    expect(prompt).toContain('Too large diverges, too small crawls.');
    expect(prompt).toContain('2: The update rule');
  });

  it('rewrites one slide through fetch', async () => {
    const response = await worker.fetch(
      new Request('https://pdf-explainer.example/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.8' },
        body: JSON.stringify({ apiKey: 'test-key', pdfBase64: 'A'.repeat(100), startSlide: 6, endSlide: 6, totalSlides: 8 }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { batch: { notes: { slide: number }[] } };
    expect(body.batch.notes.map((note) => note.slide)).toEqual([6]);
    expect(String(jsonMock.mock.calls.at(-1)?.[0]?.systemInstruction ?? '')).toContain('Explain slide 6 only');
  });
});
