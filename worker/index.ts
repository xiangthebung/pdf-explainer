/**
 * The Cloudflare Worker: the API in production, and the reason it now exists at all.
 *
 * Before this file, `npm run build` produced two things — a static `dist/` from Vite and a
 * CommonJS Node bundle of an Express server — and the Cloudflare deployment could only use
 * the first. Workers do not run CommonJS Node servers, so what was deployed was the client
 * and nothing else. Cloudflare's static-asset handler answers `GET` and `HEAD`, so every
 * `POST /api/explain` was answered **405 Method Not Allowed** by the asset server, which
 * surfaced in the app as "Could not generate notes — Request failed (405)".
 *
 * There was no bug to find in the request path. The server simply was not deployed.
 *
 * WHAT THIS DOES
 *
 * `/api/*` is handled here. Everything else is handed to the assets binding, which serves
 * the built client and falls back to `index.html` for client-side routes — see
 * `not_found_handling` in `wrangler.jsonc`. `run_worker_first` there is what guarantees the
 * asset handler never sees an API path again, which is the actual fix for the 405.
 *
 * The API key: there is no secret to configure. With no `GEMINI_API_KEY` bound,
 * `requireUserKey` is true and every caller brings their own key, which is how this is
 * deployed. Binding one as a secret (`wrangler secret put GEMINI_API_KEY`) switches it to a
 * shared key, and `REQUIRE_USER_API_KEY=true` forces bring-your-own even then.
 *
 * On CPU time: the Gemini call is I/O, and waiting on `fetch` does not spend CPU, so a
 * ninety-second generation costs almost none of the budget. What does cost is parsing the
 * request — a base64 PDF arrives inside a JSON body, and `JSON.parse` of a few megabytes is
 * real work. That is the one thing to watch if large decks start failing where small ones
 * succeed; `MAX_UPLOAD_MB` is the lever.
 */

import { dispatch, type ApiContext } from '../server/api';
import { configure } from '../server/config';
import { log } from '../server/log';

export interface Env {
  /** The built client, bound by `wrangler.jsonc`. */
  readonly ASSETS: { fetch: (request: Request) => Promise<Response> };
  readonly GEMINI_API_KEY?: string;
  readonly REQUIRE_USER_API_KEY?: string;
  readonly MAX_UPLOAD_MB?: string;
  readonly REQUEST_TIMEOUT_MS?: string;
  readonly CHAT_TIMEOUT_MS?: string;
  readonly RATE_LIMIT_WINDOW_MS?: string;
  readonly RATE_LIMIT_MAX?: string;
}

/**
 * Bindings only exist inside a request, so the configuration cannot be read at module
 * scope. Done once per isolate rather than once per request: `env` is the same object for
 * the isolate's whole life, and rebuilding the config on every call would be work for no
 * reason.
 */
let configured = false;

function envSource(env: Env): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    REQUIRE_USER_API_KEY: env.REQUIRE_USER_API_KEY,
    MAX_UPLOAD_MB: env.MAX_UPLOAD_MB,
    REQUEST_TIMEOUT_MS: env.REQUEST_TIMEOUT_MS,
    CHAT_TIMEOUT_MS: env.CHAT_TIMEOUT_MS,
    RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX: env.RATE_LIMIT_MAX,
  };
}

function json(status: number, body: unknown, extra?: Readonly<Record<string, string>>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Every reply is user- and key-specific. None of it may be cached anywhere.
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!configured) {
      configure(envSource(env));
      configured = true;
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const path = url.pathname.slice('/api'.length);
    /* Cloudflare puts the caller's address here and does not let anyone else write it,
       which is why the `TRUST_PROXY` dance the Express path needs has no equivalent. */
    const clientId = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    const ctx: ApiContext = { signal: request.signal, clientId };

    try {
      const result = await dispatch(request.method, path, () => request.json(), ctx);
      if (result.body === undefined) return new Response(null, { status: result.status });
      return json(result.status, result.body, result.headers);
    } catch (error) {
      /* `dispatch` catches everything an endpoint can throw, so reaching here means the
         failure was outside the API — a body that exceeded the platform's own limit, or a
         binding that is not there. Worth logging as itself rather than as a model error. */
      log.error('worker', error);
      return json(500, { error: 'Unexpected server error.', code: 'server', retryable: true });
    }
  },
};
