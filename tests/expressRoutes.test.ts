// @vitest-environment node
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_PATHS } from '../server/api';
import { configure } from '../server/config';
import { createApiRouter } from '../server/routes';

/**
 * The Node adapter, driven over a real socket.
 *
 * Everything else tests `dispatch` directly, which is the right way to test the
 * API and the wrong way to find out whether anyone can reach it. Between those
 * two there was a gap, and the gap had a bug in it: `server/routes.ts` mounted
 * its handler with `router.all('/{*path}')`, which is Express 5 path syntax on
 * an Express 4 dependency. The pattern compiled to something that matched no
 * request at all.
 *
 * So every `/api` call fell past the router to the single-page-app catch-all and
 * came back as `index.html` with a 200 on it. `GET /api/config` returned a web
 * page; the client's config request is a silent best-effort, so it swallowed
 * that and used its defaults, and the app looked completely normal with no API
 * behind it. `npm run dev` and `npm start` had no working API for four commits.
 *
 * This is the Cloudflare 405 exactly, wearing the other hat — and it arrived in
 * the commit that fixed the Cloudflare 405. That change split one Express app
 * into a shared `dispatch` plus two adapters, tested `dispatch` thoroughly and
 * the Worker by its shape, and left the Express adapter as the only piece with
 * nothing driving it. A unit test cannot see a route that does not match. Only
 * a request can.
 */

describe('the Express adapter', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    /* A small ceiling so the oversized-body case below can send a small body.
       Everything else here is indifferent to it. */
    configure({ MAX_UPLOAD_MB: '0.01' });
    const app = express();
    /* No `express.json()` here, deliberately: the router mounts its own, and a
       body parser the adapter does not own is a body parser whose failures the
       adapter cannot answer. That was the bug. */
    app.use('/api', createApiRouter());
    /* The SPA catch-all, because its presence is what made the failure quiet:
       without it the bug was a 404, with it the bug was a 200 full of HTML. */
    app.get('*', (_req, res) => res.status(200).type('html').send('<!doctype html><title>spa</title>'));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('answers GET /api/config with JSON rather than the app shell', async () => {
    const response = await fetch(`${base}/api/config`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { requireUserKey: boolean };
    expect(body.requireUserKey).toBe(true);
  });

  it('reaches a POST handler instead of falling through', async () => {
    // 400 is the endpoint refusing the request on its merits: no key attached.
    // Anything HTML-shaped here means the router matched nothing again.
    const response = await fetch(`${base}/api/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('missing_key');
  });

  it('reaches every path the API claims to serve', async () => {
    for (const apiPath of API_PATHS) {
      const response = await fetch(`${base}/api${apiPath}`, { method: 'POST' });
      const type = response.headers.get('content-type') ?? '';
      expect(type, `POST /api${apiPath} was not answered by the API`).toContain('application/json');
      // 404 would mean the router matched but the API disowns its own path list.
      expect(response.status, `POST /api${apiPath} is unrouted`).not.toBe(404);
    }
  });

  it('still answers 405 with an Allow header for a genuinely wrong method', async () => {
    const response = await fetch(`${base}/api/explain`, { method: 'GET' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('404s an unknown API path as JSON, not as the app shell', async () => {
    const response = await fetch(`${base}/api/summarise`, { method: 'POST' });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('leaves everything outside /api to the client', async () => {
    const response = await fetch(`${base}/some/client/route`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('html');
  });

  /**
   * The same gap as the router bug above, found a third time.
   *
   * `dispatch` answers a body it cannot parse with 400 "The request body was not
   * valid JSON", and `tests/apiDispatch.test.ts` covers it. On Node that branch
   * was unreachable: `express.json()` was mounted upstream of the router, so a
   * malformed body threw inside the body parser and skipped `dispatch` entirely,
   * landing on the app-level error handler as 500 "Unexpected server error" with
   * `retryable: true`.
   *
   * Two deploy targets answering the same bytes differently, and the wrong answer
   * being the one that tells the client to retry a request that can never
   * succeed. Testing the shared core proves nothing about the adapters over it —
   * which is the lesson this file already existed to record.
   */
  it('answers a malformed JSON body the way dispatch does, not as a 500', async () => {
    const response = await fetch(`${base}/api/explain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { code: string; error: string; retryable: boolean };
    expect(body.code).toBe('bad_request');
    expect(body.retryable).toBe(false);
    expect(body.error).toContain('not valid JSON');
  });

  /**
   * The other thing `express.json()` throws, and the reason the router has to own
   * both. The 413 answer used to live in `server/index.ts`, which the Worker does
   * not run and this suite did not exercise; moving body parsing into the router
   * put the answer next to the parser that raises it.
   *
   * `MAX_UPLOAD_MB` is tiny here so the body can be. The envelope is
   * `maxUploadMb + 6`, so 6.5 MB is over the limit and still cheap to build.
   */
  it('answers an oversized body as too_large rather than as a server fault', async () => {
    const response = await fetch(`${base}/api/explain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"pdfBase64":"${'A'.repeat(6_500_000)}"}`,
    });
    expect(response.status).toBe(413);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { code: string; retryable: boolean };
    expect(body.code).toBe('too_large');
    expect(body.retryable).toBe(false);
  });
});
