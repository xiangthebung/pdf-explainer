import { afterEach, describe, expect, it } from 'vitest';
import { dispatch } from '../server/api';
import { configure } from '../server/config';

/**
 * The API's front door, tested without a web framework in front of it.
 *
 * Both things this app deploys as are now thin adapters over `dispatch` — Express for local
 * development and the smoke suite, a Cloudflare Worker in production — so this is the one
 * place worth pinning the routing behaviour. It used to be Express's own router, which meant
 * it could only be tested by starting a server, which meant it was only tested in the
 * environment where it already worked.
 *
 * The 405 case is here for a specific reason: a 405 is what users saw when the API was not
 * deployed at all, produced by a static-asset handler with nothing to say. If this API ever
 * answers 405, it should be because the method is genuinely wrong, and it should say so.
 */

const ctx = (clientId: string) => ({ signal: new AbortController().signal, clientId });
const noBody = async () => ({});

afterEach(() => configure({}));

describe('dispatch', () => {
  it('serves the client configuration on GET', async () => {
    const result = await dispatch('GET', '/config', noBody, ctx('a'));
    expect(result.status).toBe(200);
    const body = result.body as { models: unknown[]; requireUserKey: boolean };
    expect(Array.isArray(body.models)).toBe(true);
    // No server key configured, so every caller brings their own. This is the deployed mode.
    expect(body.requireUserKey).toBe(true);
  });

  it('answers a genuine 405 that names the methods it takes', async () => {
    const result = await dispatch('GET', '/explain', noBody, ctx('b'));
    expect(result.status).toBe(405);
    expect(result.headers?.Allow).toBe('POST');
    expect(String((result.body as { error: string }).error)).toContain('POST');
  });

  it('answers 404 for a path it does not serve', async () => {
    const result = await dispatch('POST', '/summarise', noBody, ctx('c'));
    expect(result.status).toBe(404);
  });

  it('reaches the handler on POST rather than refusing the method', async () => {
    /* The whole point. This used to be a 405 from a static-asset server; a 400 means the
       request arrived, was understood, and was rejected on its merits — no PDF attached. */
    const result = await dispatch('POST', '/explain', async () => ({ apiKey: 'k' }), ctx('d'));
    expect(result.status).toBe(400);
    expect((result.body as { code: string }).code).toBe('bad_request');
  });

  it('tolerates a trailing slash', async () => {
    expect((await dispatch('GET', '/config/', noBody, ctx('e'))).status).toBe(200);
  });

  it('reports a body that is not JSON as a bad request', async () => {
    const result = await dispatch(
      'POST',
      '/chat',
      async () => {
        throw new SyntaxError('Unexpected token');
      },
      ctx('f'),
    );
    expect(result.status).toBe(400);
    expect((result.body as { retryable: boolean }).retryable).toBe(false);
  });

  it('does not read the body before deciding the request is unroutable', async () => {
    let read = false;
    const result = await dispatch(
      'POST',
      '/summarise',
      async () => {
        read = true;
        return {};
      },
      ctx('g'),
    );
    expect(result.status).toBe(404);
    // A 40 MB upload should not be pulled over the wire to be told the path is wrong.
    expect(read).toBe(false);
  });

  it('rate limits a single caller without touching the others', async () => {
    configure({ RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW_MS: '60000' });
    const noisy = ctx('noisy');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await dispatch('GET', '/config', noBody, noisy)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    // A different caller has its own bucket.
    expect((await dispatch('GET', '/config', noBody, ctx('quiet'))).status).toBe(200);
  });
});
