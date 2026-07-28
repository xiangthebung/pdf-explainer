import { describe, expect, it } from 'vitest';
import { closeTruncatedJson, extractJsonText, parseModelJson, repairJsonEscapes } from '../server/json';
import { normalizeExplainBatch } from '../shared/normalize';

describe('extractJsonText', () => {
  it('unwraps a fenced block', () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('drops chatter before and after the payload', () => {
    expect(extractJsonText('Sure! Here you go:\n{"a":1}\nHope that helps.')).toBe('{"a":1}');
  });
});

describe('repairJsonEscapes', () => {
  it('escapes lone backslashes so LaTeX survives a parse', () => {
    const { text, changed } = repairJsonEscapes('{"content":"$\\frac{a}{b}$"}');
    expect(changed).toBe(true);
    expect(JSON.parse(text)).toEqual({ content: '$\\frac{a}{b}$' });
  });

  it('leaves valid escapes alone', () => {
    const { text, changed } = repairJsonEscapes('{"a":"line\\nbreak \\"quoted\\" \\u00e9"}');
    expect(changed).toBe(false);
    expect(JSON.parse(text).a).toBe('line\nbreak "quoted" é');
  });

  it('escapes raw newlines inside strings', () => {
    const { text } = repairJsonEscapes('{"a":"one\ntwo"}');
    expect(JSON.parse(text).a).toBe('one\ntwo');
  });
});

describe('closeTruncatedJson', () => {
  it('rewinds to the last complete value and closes the containers', () => {
    const truncated = '{"explanations":[{"slideNumber":1,"blocks":"ok"},{"slideNumber":2,"blocks":"half';
    const closed = closeTruncatedJson(truncated);
    expect(closed).not.toBeNull();
    const parsed = JSON.parse(closed as string) as { explanations: unknown[] };
    expect(parsed.explanations).toHaveLength(1);
  });

  it('returns null for well-formed input', () => {
    expect(closeTruncatedJson('{"a":1}')).toBeNull();
  });
});

describe('parseModelJson', () => {
  it('parses clean output without claiming a repair', () => {
    const result = parseModelJson('{"a":1}');
    expect(result?.data).toEqual({ a: 1 });
    expect(result?.repaired).toBe(false);
    expect(result?.truncated).toBe(false);
  });

  it('repairs unescaped LaTeX', () => {
    const result = parseModelJson('{"content":"Use \\frac{1}{2} here"}');
    expect((result?.data as { content: string }).content).toBe('Use \\frac{1}{2} here');
    expect(result?.repaired).toBe(true);
  });

  it('repairs trailing commas', () => {
    const result = parseModelJson('{"a":[1,2,],}');
    expect(result?.data).toEqual({ a: [1, 2] });
    expect(result?.repaired).toBe(true);
  });

  it('salvages a response that hit the token ceiling', () => {
    const truncated = `{"startSlide":1,"endSlide":3,"totalSlides":10,"explanations":[
      {"slideNumber":1,"blocks":[{"type":"markdown","content":"Slide one, fine."}]},
      {"slideNumber":2,"blocks":[{"type":"markdown","content":"Slide two, also fine."}]},
      {"slideNumber":3,"blocks":[{"type":"markdown","content":"Slide three, cut off mid-sent`;

    const result = parseModelJson(truncated);
    expect(result).not.toBeNull();
    expect(result?.truncated).toBe(true);

    // The salvaged prefix must still normalise into usable notes.
    const batch = normalizeExplainBatch(result?.data, { requestedFrom: 1, totalSlides: 10 });
    expect(batch.notes.map((note) => note.slide)).toEqual([1, 2]);
    expect(batch.notes[0].blocks[0].content).toBe('Slide one, fine.');
  });

  it('gives up on input with no JSON in it', () => {
    expect(parseModelJson('I cannot help with that.')).toBeNull();
    expect(parseModelJson('')).toBeNull();
  });
});
