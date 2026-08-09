import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiFailure } from '../src/lib/api';

/**
 * What the client says when the API is not there.
 *
 * Three times now this app has shipped a state where the browser could reach a
 * server but not its API, and each time the reader was handed a bare status
 * code. The Cloudflare deploy served the client as static assets with no Worker
 * behind it, so every POST was answered 405 by the asset handler. The Express
 * router was later written in a path syntax its own major version could not
 * parse, so every call fell through to the single-page-app fallback and came
 * back 404. And a development server that had not been restarted served a new
 * client against an old server that had never heard of `/api/models` — also a
 * 404, and the one a person actually hit.
 *
 * "Could not generate notes — Request failed (404)" is true and useless. These
 * pin the message that replaces it.
 */

function respondWith(status: number, body: string, contentType?: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(body, { status, headers: contentType ? { 'content-type': contentType } : {} }),
    ),
  );
}

/** The call must reject, and reject with our own failure type. */
async function failureOf(call: Promise<unknown>): Promise<ApiFailure> {
  try {
    await call;
  } catch (error) {
    if (error instanceof ApiFailure) return error;
    throw error;
  }
  throw new Error('expected the request to fail, and it did not');
}

afterEach(() => vi.unstubAllGlobals());

describe('a 404 from our own API', () => {
  it('names the endpoint and the likeliest cause', async () => {
    // A stale dev server answers an unknown POST with an empty-bodied 404.
    respondWith(404, '');
    const error = await failureOf(api.models('some-key'));
    expect(error.message).toContain('/api/models');
    expect(error.message).toContain('404');
    expect(error.message).toMatch(/restart the dev server/i);
    // Retrying an endpoint that does not exist never helps.
    expect(error.retryable).toBe(false);
  });

  it('says the same for a 405, which is how the Cloudflare failure presented', async () => {
    respondWith(405, '');
    const error = await failureOf(api.explain({} as never));
    expect(error.message).toContain('/api/explain');
    expect(error.message).toContain('405');
  });

  it('does not blame a proxy when the 404 arrives as an error page', async () => {
    /* An HTML body used to win, and reported "a proxy timed out or the upload
       was too large" — a plausible story about the wrong problem. */
    respondWith(404, '<!DOCTYPE html><html><title>Not Found</title></html>', 'text/html');
    const error = await failureOf(api.chat({} as never));
    expect(error.message).not.toMatch(/proxy/i);
    expect(error.message).toContain('404');
  });
});

describe('everything else still reads as it did', () => {
  it('passes a real API error through untouched', async () => {
    respondWith(
      401,
      JSON.stringify({ error: 'That API key was rejected by Google.', code: 'invalid_key', retryable: false }),
      'application/json',
    );
    const error = await failureOf(api.models('bad'));
    expect(error.code).toBe('invalid_key');
    expect(error.message).toBe('That API key was rejected by Google.');
  });

  it('explains an HTML body on a status that really could be a proxy', async () => {
    respondWith(504, '<!DOCTYPE html><html><h1>Gateway Timeout</h1></html>', 'text/html');
    const error = await failureOf(api.explain({} as never));
    expect(error.message).toMatch(/web page instead of data/i);
    expect(error.retryable).toBe(true);
  });
});
