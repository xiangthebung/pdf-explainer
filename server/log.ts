/**
 * Logging with secrets removed at the boundary.
 *
 * API keys travel through this server on their way to Google. They must never
 * reach stdout, an error message, or the browser. Everything that gets logged or
 * returned goes through `redact` first.
 */

const PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_\-]{10,}/g, // Google API keys
  /\b(?:sk|rk)-[A-Za-z0-9_\-]{12,}/g, // other common key shapes
  /([?&](?:key|api_?key|access_token)=)[^&\s"']+/gi,
  /("?(?:apiKey|api_key|customApiKey|authorization)"?\s*[:=]\s*)"?[^",\s}]+"?/gi,
];

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
    text = text.replace(pattern, (_match, prefix?: string) => `${prefix ?? ''}[redacted]`);
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
