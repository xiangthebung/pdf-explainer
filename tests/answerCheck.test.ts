import { describe, expect, it } from 'vitest';
import { answerHint, checkAnswer, maskAnswer, normalizeAnswer } from '../src/practice/answerCheck';

describe('normalizeAnswer', () => {
  it('ignores case, accents, punctuation and leading articles', () => {
    expect(normalizeAnswer('  The Ionosphère, ')).toBe('ionosphere');
    expect(normalizeAnswer('“Trilateration”')).toBe('trilateration');
  });
});

describe('checkAnswer', () => {
  it('accepts an exact answer', () => {
    expect(checkAnswer('ionosphere', 'ionosphere')).toBe('correct');
  });

  it('accepts a small typo in a long word', () => {
    expect(checkAnswer('ionosphre', 'ionosphere')).toBe('correct');
    expect(checkAnswer('trilateraton', 'trilateration')).toBe('correct');
  });

  it('rejects a different short word', () => {
    expect(checkAnswer('sky', 'sun')).toBe('wrong');
  });

  it('is strict about numbers', () => {
    expect(checkAnswer('38 microseconds', '38 microseconds')).toBe('correct');
    expect(checkAnswer('48 microseconds', '38 microseconds')).toBe('wrong');
    expect(checkAnswer('1575.42 MHz', '1575.42 mhz')).toBe('correct');
  });

  it('calls a partial phrase close rather than correct', () => {
    expect(checkAnswer('phase', 'carrier phase tracking')).toBe('close');
  });

  it('treats an empty answer as wrong', () => {
    expect(checkAnswer('   ', 'anything')).toBe('wrong');
  });
});

describe('hints', () => {
  it('gives the shape of the answer without giving it away', () => {
    expect(answerHint('ionosphere')).toBe('starts with “I” · 10 characters');
    expect(answerHint('carrier phase tracking')).toBe('starts with “C” · 3 words · 20 characters');
    expect(answerHint('   ')).toBe('');
  });

  it('masks everything but the first letter and the word breaks', () => {
    expect(maskAnswer('bayes rule')).toBe('B•••• ••••');
    expect(maskAnswer('a')).toBe('A');
    expect(maskAnswer('')).toBe('');
  });
});
