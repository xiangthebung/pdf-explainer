/**
 * Answer checking for typed recall.
 *
 * Typing the right idea with a typo, different case, or a stray article should
 * count. Typing something else should not. This is deliberately forgiving on
 * form and strict on substance.
 */

export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[`'’"“”(){}\[\].,;:!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Articles carry no information in a one-term answer.
    .replace(/^(?:the|a|an)\s+/, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export type AnswerVerdict = 'correct' | 'close' | 'wrong';

/**
 * Enough of a nudge to make a stuck blank solvable without giving it away:
 * the first letter, the shape, and how long it is.
 */
export function answerHint(expected: string): string {
  const trimmed = expected.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/).filter(Boolean);
  const letters = trimmed.replace(/\s+/g, '').length;
  const parts = [`starts with “${trimmed[0].toUpperCase()}”`];
  if (words.length > 1) parts.push(`${words.length} words`);
  parts.push(`${letters} character${letters === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** `Bayes rule` -> `B•••• ••••`. The shape of the answer, not the answer. */
export function maskAnswer(expected: string): string {
  const trimmed = expected.trim();
  if (!trimmed) return '';
  return [...trimmed]
    .map((char, index) => (index === 0 ? char.toUpperCase() : /\s/.test(char) ? ' ' : '•'))
    .join('');
}

export function checkAnswer(input: string, expected: string): AnswerVerdict {
  const guess = normalizeAnswer(input);
  const target = normalizeAnswer(expected);
  if (!guess) return 'wrong';
  if (guess === target) return 'correct';

  // Numbers and units must match exactly; "38" is not "48".
  if (/\d/.test(target)) return guess.replace(/\s/g, '') === target.replace(/\s/g, '') ? 'correct' : 'wrong';

  const distance = levenshtein(guess, target);
  const tolerance = target.length > 8 ? 2 : target.length > 4 ? 1 : 0;
  if (distance <= tolerance) return 'correct';
  // A single-word answer inside a longer phrase counts as close, not correct.
  if (target.includes(guess) || guess.includes(target)) return 'close';
  return 'wrong';
}
