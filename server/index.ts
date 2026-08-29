/**
 * The Node entry point: local development and the smoke suite.
 *
 * Production is `worker/index.ts`. Both are adapters over `server/api.ts`; see the note
 * there for why the API stopped being an Express app.
 *
 * `dotenv` is imported here rather than in `server/config.ts` because it is Node-only and
 * config is now shared with a Worker, where there is no `.env` file and no `process` to
 * read at import time. Whoever owns the entry point owns where settings come from.
 */
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { config, configure } from './config';
import { securityHeaders } from './headers';
import { log } from './log';
import { createApiRouter } from './routes';

/**
 * `--production`, because `NODE_ENV=production npm start` is not portable.
 *
 * `npm start` was `node build/server.cjs` and the README called it "serve the
 * production build". It did not. Nothing in the repository sets `NODE_ENV`, so
 * `config.isProduction` was false, and that flag decides two things a long way
 * apart: whether `dist/` is served or a Vite dev server is booted in front of it,
 * and whether `securityHeaders` emits the CSP. So the documented way to run this
 * served the client through a development bundler with no CSP on it — measured,
 * not deduced: the process logged "listening on :3457 — development" and answered
 * with no `Content-Security-Policy` header.
 *
 * The obvious fix, an inline `NODE_ENV=production` in the script, works in `sh`
 * and is a syntax error in the `cmd.exe` npm uses on Windows. A flag is read by
 * the program rather than by the shell, so it means the same thing everywhere and
 * costs no dependency. `NODE_ENV` still wins when it is set, so nothing that
 * already exports it changes.
 */
function environment(): NodeJS.ProcessEnv {
  if (process.env.NODE_ENV) return process.env;
  if (process.argv.includes('--production')) return { ...process.env, NODE_ENV: 'production' };
  return process.env;
}

async function start(): Promise<void> {
  configure(environment());
  const app = express();

  app.disable('x-powered-by');
  // A hop count when it reads as one, otherwise passed through so 'loopback', a
  // subnet or a comma-separated list all work. See config.trustProxy for why this
  // has no default.
  if (config.trustProxy) {
    const hops = Number(config.trustProxy);
    app.set('trust proxy', Number.isInteger(hops) && hops >= 0 ? hops : config.trustProxy);
  }
  /* No body parser here. `createApiRouter()` mounts its own, because `/api` is the
     only thing that reads a body and because a parser mounted upstream of the
     router throws past it — which is how a malformed body became a 500 on Node and
     a 400 on Workers. See the note in server/routes.ts. */

  /* The same headers the Worker sets, minus the CSP in development — Vite's dev
     server injects its HMR client inline and react-refresh needs `eval`. See the
     note in server/headers.ts. */
  const headers = securityHeaders(config.isProduction);
  app.use((_req, res, next) => {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    next();
  });

  // Never cache API responses; they are user- and key-specific.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', createApiRouter());

  /* Last resort only. Everything an API request can raise is answered by the API
     router, which owns its own parser; anything arriving here is genuinely ours. */
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    log.error('http', error);
    res.status(500).json({ error: 'Unexpected server error.', code: 'server', retryable: true });
  });

  if (config.isProduction) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        setHeaders(res, filePath) {
          // Vite fingerprints assets, so they can be cached hard; index.html cannot.
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
          else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(config.port, '0.0.0.0', () => {
    log.info(
      'server',
      `listening on :${config.port} — ${config.isProduction ? 'production' : 'development'}, ` +
        `${config.hasServerKey ? 'server key available' : 'no server key'}, ` +
        `${config.requireUserKey ? 'user key required' : 'user key optional'}`,
    );
  });
}

start().catch((error) => {
  log.error('server', error);
  process.exitCode = 1;
});
