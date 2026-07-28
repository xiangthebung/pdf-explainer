import { describe, expect, it } from 'vitest';
import { looksLikeUnsupportedConfig, tuningLadder } from '../server/gemini';

/**
 * How you ask a Gemini model to think less changed between model generations:
 * the 2.5 family wants `thinkingBudget: 0`, the 3.x family rejects that outright
 * and wants `thinkingLevel`. These tests pin the ladder that finds out at
 * runtime, because getting it wrong looks like "the AI returned nothing".
 */
describe('tuningLadder', () => {
  it('prefers thinkingLevel, falls back to thinkingBudget, then to plain', () => {
    const ladder = tuningLadder({ disableThinking: true, maxOutputTokens: 8192 });
    expect(ladder).toEqual([
      { maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'low' } },
      { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
      { maxOutputTokens: 8192 },
      {},
    ]);
  });

  it('keeps the ceiling but leaves thinking alone when not asked', () => {
    expect(tuningLadder({ maxOutputTokens: 4096 })).toEqual([{ maxOutputTokens: 4096 }, {}]);
  });

  it('asks for nothing special when there is nothing to ask for', () => {
    expect(tuningLadder({})).toEqual([{}]);
  });
});

describe('looksLikeUnsupportedConfig', () => {
  const withStatus = (status: number, message: string) => Object.assign(new Error(message), { status });

  it('recognises the 400 Google returns for a rejected knob', () => {
    expect(
      looksLikeUnsupportedConfig(
        withStatus(400, '{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}'),
      ),
    ).toBe(true);
    expect(looksLikeUnsupportedConfig(withStatus(400, 'max_output_tokens must be less than 8192'))).toBe(true);
  });

  it('does not mistake a quota or auth failure for a bad knob', () => {
    expect(looksLikeUnsupportedConfig(withStatus(429, 'Resource exhausted: quota'))).toBe(false);
    expect(looksLikeUnsupportedConfig(withStatus(401, 'API key not valid'))).toBe(false);
    expect(looksLikeUnsupportedConfig(withStatus(400, 'The request body is malformed'))).toBe(false);
  });
});
