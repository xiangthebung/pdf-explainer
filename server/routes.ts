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

import type { NextFunction, Request, Response, Router } from 'express';
import express from 'express';
import { bodyTooLarge, dispatch, invalidJsonBody, type ApiContext, type ApiResponse } from './api';
import { jsonBodyLimit } from './config';

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

/** Write an `ApiResponse` to an Express response. The one place that translates. */
function send(res: Response, result: ApiResponse): void {
  if (res.writableEnded) return;
  if (result.headers) for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.body === undefined) {
    res.status(result.status).end();
    return;
  }
  res.status(result.status).json(result.body);
}

export function createApiRouter(): Router {
  const router = express.Router();

  /*
   * The body parser belongs to the router, not to the app.
   *
   * It used to be mounted in `server/index.ts`, upstream of here, which meant the
   * two things it throws — a malformed body and an oversized one — never reached
   * this file and were answered by the app's generic error handler instead. A
   * malformed body came back 500 "Unexpected server error" with `retryable: true`,
   * while the Worker answered the identical bytes 400 "The request body was not
   * valid JSON". A parser whose failures the adapter cannot answer is a parser the
   * adapter does not own; now it owns it, and both targets return the same value
   * from `server/api.ts`.
   *
   * The limit stays on the parser rather than in a handler because body-parser
   * aborts the stream when it is exceeded, so an oversized upload is refused
   * without first buffering forty megabytes of it.
   */
  router.use(express.json({ limit: jsonBodyLimit() }));

  /*
   * `router.use`, not `router.all('/<pattern>')`, and that is the whole point.
   *
   * This was `router.all('/{*path}')`, which is Express 5 path syntax. The
   * dependency is Express 4, whose path-to-regexp does not know braces — so the
   * pattern matched nothing, every `/api` request fell through to the SPA
   * catch-all, and `GET /api/config` answered with `index.html`. The client
   * treats a failed config request as "use the defaults" and says nothing, so
   * the app looked fine and had no API behind it.
   *
   * Which is the Cloudflare 405 again, in the other direction, introduced by the
   * commit that fixed it: the Worker was tested and the Node adapter was not.
   * `router.use` matches every method and every path with no pattern to compile,
   * so there is no syntax here to be wrong about in either major version.
   */
  router.use(async (req, res) => {
    const ctx: ApiContext = { signal: requestSignal(res), clientId: req.ip ?? 'unknown' };
    /* Express has already parsed the body by the time this runs — `express.json()` is
       mounted upstream — so the thunk `dispatch` wants is just a value in a promise. The
       laziness matters on the Worker, where reading the body is real work. */
    const result = await dispatch(req.method, req.path, async () => req.body, ctx);
    send(res, result);
  });

  /*
   * Body-parser failures land here, having skipped the handler above.
   *
   * Express routes an error past every ordinary middleware to the next one that
   * declares four parameters, so this has to be registered after the handler and
   * has to keep `next` in its signature even though it barely uses it — remove the
   * parameter and Express stops treating it as an error handler at all, silently.
   *
   * `entity.too.large` and `entity.parse.failed` are body-parser's own type tags;
   * they are checked rather than the status alone so an unrelated 413 from further
   * up cannot be reported as an upload that was too big.
   */
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const type = (error as { type?: string })?.type;
    if (type === 'entity.too.large') {
      send(res, bodyTooLarge());
      return;
    }
    if (type === 'entity.parse.failed' || error instanceof SyntaxError) {
      send(res, invalidJsonBody());
      return;
    }
    next(error);
  });

  return router;
}
