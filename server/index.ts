import express from 'express';
import path from 'node:path';
import { config, jsonBodyLimit } from './config';
import { log } from './log';
import { createApiRouter } from './routes';

async function start(): Promise<void> {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: jsonBodyLimit }));

  // Never cache API responses; they are user- and key-specific.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', createApiRouter());

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = (error as { status?: number })?.status;
    if (status === 413) {
      res.status(413).json({
        error: `That upload is larger than the ${config.maxUploadMb} MB limit.`,
        code: 'too_large',
        retryable: false,
      });
      return;
    }
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
