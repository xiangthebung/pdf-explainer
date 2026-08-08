import { describe, expect, it } from 'vitest';
import { redact } from '../server/log';

/**
 * The one guarantee this server makes about the user's key is that it never
 * reaches a log line. That guarantee is a regex list, and a regex list quietly
 * stops being true when a provider changes its key format — which is exactly
 * what happened: `AIza…` was covered and `AQ.Ab8…`, the format AI Studio mints
 * today, was not. So both formats are pinned here.
 */

/* Shaped like the real thing, but not a key: no live credential in the repo. */
const CLASSIC = 'AIzaSyD-EXAMPLEEXAMPLEEXAMPLEEXAMPLE1234';
const CURRENT = 'AQ.Ab8RN6JEXAMPLEEXAMPLEEXAMPLEEXAMPLExy';

describe('redact', () => {
  it('removes the classic AIza key format', () => {
    expect(redact(`key rejected: ${CLASSIC}`)).not.toContain(CLASSIC);
  });

  it('removes the current AQ. key format', () => {
    // Google echoes the key back in some of its own rejection messages, and
    // `fromModelError` passes that message to log.warn.
    const message = `API key not valid. Please pass a valid API key: ${CURRENT}`;
    expect(redact(message)).not.toContain(CURRENT);
    expect(redact(message)).toContain('[redacted]');
  });

  it('leaves nothing but [redacted] behind', () => {
    // The replacer used to read the match offset as a capture group, so this
    // came back as "key rejected: 14[redacted]".
    expect(redact(`key rejected: ${CLASSIC}`)).toBe('key rejected: [redacted]');
    expect(redact(`bearer ${CURRENT} sent`)).toBe('bearer [redacted] sent');
  });

  it('keeps the name of a labelled field while dropping its value', () => {
    expect(redact('{"apiKey":"whatever-this-is"}')).toContain('apiKey');
    expect(redact('{"apiKey":"whatever-this-is"}')).not.toContain('whatever-this-is');
    expect(redact('GET /v1/models?key=abc123def456')).toBe('GET /v1/models?key=[redacted]');
    expect(redact('x-goog-api-key: abc123def456')).not.toContain('abc123def456');
  });

  it('redacts inside errors and objects, not just strings', () => {
    expect(redact(new Error(`upstream said ${CURRENT}`))).not.toContain(CURRENT);
    expect(redact({ note: `tried ${CLASSIC}` })).not.toContain(CLASSIC);
  });

  it('leaves ordinary text alone', () => {
    const ordinary = 'explain: slides 3-14 of 42 in 1840ms';
    expect(redact(ordinary)).toBe(ordinary);
  });
});
