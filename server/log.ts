/**
 * Logging with secrets removed at the boundary.
 *
 * API keys travel through this server on their way to Google. They must never
 * reach stdout, an error message, or the browser. Everything that gets logged or
 * returned goes through `redact` first.
 *
 * Two things this got wrong, both worth keeping written down.
 *
 * The pattern list only knew `AIza…`, which is the *old* Google key format. Keys
 * minted by AI Studio today look like `AQ.Ab8…`, and Google echoes the rejected
 * key back inside some "API key not valid" messages — which `fromModelError`
 * hands straight to `log.warn`. So the one format most likely to appear in a log
 * line was the one format that passed through untouched.
 *
 * And the replacement callback read its second argument as a capture group. For
 * a pattern with no groups that argument is the match *offset*, so redacting
 * `AIza…` produced `19[redacted]` — the key was gone, but a stray number was
 * left in its place. `keptPrefix` below reads the argument list properly.
 */

/**
 * Each pattern either has exactly one capture group — the part to keep, such as
 * `apiKey=` — or none at all, in which case the whole match goes.
 */
const PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_\-]{10,}/g, // Google API keys, classic format
  /\bAQ\.[A-Za-z0-9_\-]{10,}/g, // Google API keys, current AI Studio format
  /\b(?:sk|rk)-[A-Za-z0-9_\-]{12,}/g, // other common key shapes
  /([?&](?:key|api_?key|access_token)=)[^&\s"']+/gi,
  /("?(?:apiKey|api_key|customApiKey|x-goog-api-key|authorization)"?\s*[:=]\s*)"?[^",\s}]+"?/gi,
];

/**
 * The replacer is called as `(match, ...captures, offset, whole)`. Only a string
 * in the first slot after the match is a capture group; anything else means the
 * pattern had none and there is no prefix to put back.
 */
function keptPrefix(args: unknown[]): string {
  return typeof args[1] === 'string' ? args[1] : '';
}

export function redact(input: unknown): string {
  let text =
    input instanceof Error
      ? `${input.name}: ${input.message}`
      : typeof input === 'string'
        ? input
        : (() => {
            try {
              return JSON.stringify(input);
            } catch {
              return String(input);
            }
          })();

  for (const pattern of PATTERNS) {
    text = text.replace(pattern, (...args: unknown[]) => `${keptPrefix(args)}[redacted]`);
  }
  return text;
}

const stamp = () => new Date().toISOString().slice(11, 23);

export const log = {
  info(scope: string, message: string, extra?: Record<string, unknown>) {
    const suffix = extra ? ` ${redact(extra)}` : '';
    console.log(`${stamp()} [${scope}] ${redact(message)}${suffix}`);
  },
  warn(scope: string, message: unknown) {
    console.warn(`${stamp()} [${scope}] ${redact(message)}`);
  },
  error(scope: string, message: unknown) {
    console.error(`${stamp()} [${scope}] ${redact(message)}`);
  },
};
