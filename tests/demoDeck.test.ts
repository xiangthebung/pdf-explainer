import { describe, expect, it } from 'vitest';
import { isMermaidLanguage, isSvgLanguage, prepareMarkdown } from '../shared/markdown';
import { normalizeExplainBatch } from '../shared/normalize';
import { buildMarkdownExport } from '../src/lib/export';
import { DEMO_PDF_BASE64, DEMO_RAW_RESPONSE, DEMO_TOTAL_SLIDES } from '../src/demo/demoDeck';

/**
 * The demo deck doubles as a fixture: it is real model output, complete with
 * LaTeX, Mermaid and inline SVG, so it exercises the whole pipeline.
 */
const batch = normalizeExplainBatch(DEMO_RAW_RESPONSE, { requestedFrom: 1, totalSlides: DEMO_TOTAL_SLIDES });

describe('demo deck', () => {
  it('is a real PDF', () => {
    expect(DEMO_PDF_BASE64.startsWith('JVBERi0')).toBe(true);
    expect(DEMO_PDF_BASE64.length).toBeGreaterThan(10_000);
  });

  it('normalises to one note per slide with no warnings', () => {
    expect(batch.notes.map((note) => note.slide)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(batch.from).toBe(1);
    expect(batch.to).toBe(10);
    expect(batch.track).toBe('quantitative');
    expect(batch.warnings).toEqual([]);
  });

  it('produces usable practice on every slide', () => {
    for (const note of batch.notes) {
      const items = note.quiz.length + note.matching.length + note.cloze.length;
      expect(items, `slide ${note.slide} has no practice`).toBeGreaterThan(0);
      for (const question of note.quiz) {
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options[question.correctIndex]).toBeTruthy();
      }
      for (const set of note.matching) {
        expect(set.pairs.length).toBeGreaterThanOrEqual(2);
        expect(set.title).not.toContain('"pairs"');
      }
      for (const item of note.cloze) {
        expect(item.answer.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps ids unique across the deck', () => {
    const ids = batch.notes.flatMap((note) => [
      ...note.quiz.map((item) => item.id),
      ...note.matching.map((item) => item.id),
      ...note.cloze.map((item) => item.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains the diagram and maths cases the renderer has to handle', () => {
    const blocks = batch.notes.flatMap((note) => note.blocks.map((block) => block.content));
    expect(blocks.some((content) => content.includes('```mermaid'))).toBe(true);
    expect(blocks.some((content) => content.includes('```svg'))).toBe(true);
    expect(blocks.some((content) => content.includes('$$'))).toBe(true);
    expect(blocks.some((content) => content.includes('\\begin{bmatrix}'))).toBe(true);
    expect(blocks.some((content) => content.includes('| Error Source |'))).toBe(true);
  });

  it('survives markdown preparation with its structure intact', () => {
    for (const note of batch.notes) {
      for (const block of note.blocks) {
        const prepared = prepareMarkdown(block.content);
        expect(prepared.length).toBeGreaterThan(0);

        // Fenced diagrams must come through untouched, or nothing renders.
        const fences = block.content.match(/```(\w+)?/g) ?? [];
        expect(prepared.match(/```(\w+)?/g)?.length ?? 0).toBe(fences.length);

        if (block.content.includes('```mermaid')) {
          const code = block.content.split('```mermaid')[1].split('```')[0];
          expect(isMermaidLanguage('mermaid', code)).toBe(true);
          expect(prepared).toContain(code.trim().split('\n')[0].trim());
        }
        if (block.content.includes('```svg')) {
          const code = block.content.split('```svg')[1].split('```')[0];
          expect(isSvgLanguage('svg', code)).toBe(true);
          expect(prepared).toContain('<svg');
        }
        // Balanced display maths delimiters.
        expect((prepared.match(/\$\$/g) ?? []).length % 2).toBe(0);
      }
    }
  });

  it('exports to markdown without losing slides', () => {
    const output = buildMarkdownExport({
      deckName: 'Demo',
      totalSlides: DEMO_TOTAL_SLIDES,
      notes: batch.notes,
      includePractice: true,
      includeChat: false,
    });
    for (let slide = 1; slide <= DEMO_TOTAL_SLIDES; slide += 1) {
      expect(output).toContain(`## Slide ${slide}`);
    }
  });
});
