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
    configure({});
    const app = express();
    app.use(express.json());
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
});
