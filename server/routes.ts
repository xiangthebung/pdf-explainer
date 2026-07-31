/**
 * The Express adapter. Twenty lines over `server/api.ts`, which holds the actual API.
 *
 * This file used to *be* the API: four handlers, a rate limiter and a pile of body-reading
 * helpers, all written against `req` and `res`. That was fine while Express was the only
 * way this ran, and it is why the Cloudflare deployment had no API at all — see the note at
 * the top of `server/api.ts` for how that presented (a 405 from the static-asset handler)
 * and why nothing in the test suite could see it.
 *
 * Express survives because it is the right thing for local development and for the smoke
 * suite: `npm run dev` gets Vite's middleware and hot reload, and `scripts/smoke.mjs` drives
 * a real browser against a real Node process. Production is `worker/index.ts`.
 */

import type { Response, Router } from 'express';
import express from 'express';
import { dispatch, type ApiContext } from './api';

/**
 * Abort the upstream model call as soon as the browser hangs up.
 *
 * Only the response stream is watched: `req` emits 'close' as soon as its body has been
 * consumed, which would cancel every request the moment it started.
 */
export function requestSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

export function createApiRouter(): Router {
  const router = express.Router();

  router.all('/{*path}', async (req, res) => {
    const ctx: ApiContext = { signal: requestSignal(res), clientId: req.ip ?? 'unknown' };
    /* Express has already parsed the body by the time this runs — `express.json()` is
       mounted upstream — so the thunk `dispatch` wants is just a value in a promise. The
       laziness matters on the Worker, where reading the body is real work. */
    const result = await dispatch(req.method, req.path, async () => req.body, ctx);

    if (res.writableEnded) return;
    if (result.headers) for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
    if (result.body === undefined) {
      res.status(result.status).end();
      return;
    }
    res.status(result.status).json(result.body);
  });

  return router;
}
