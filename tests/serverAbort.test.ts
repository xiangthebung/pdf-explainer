// @vitest-environment node
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestSignal } from '../server/routes';

/**
 * Regression cover for request cancellation.
 *
 * Watching `req` for 'close' looks right and is wrong: Node fires it as soon as
 * the request body has been consumed, which aborted every upstream model call
 * the instant it started. These two cases pin the behaviour down.
 */
describe('requestSignal', () => {
  let server: Server;
  let port = 0;
  let observed: boolean | null = null;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post('/slow', (_req, res) => {
      const signal = requestSignal(res);
      setTimeout(() => {
        observed = signal.aborted;
        if (!res.writableEnded) res.json({ ok: true });
      }, 250);
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        port = typeof address === 'object' && address ? address.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('stays open while the client is still waiting', async () => {
    observed = null;
    const response = await fetch(`http://127.0.0.1:${port}/slow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(response.status).toBe(200);
    expect(observed).toBe(false);
  });

  it('aborts when the client hangs up mid-flight', async () => {
    observed = null;
    const controller = new AbortController();
    const pending = fetch(`http://127.0.0.1:${port}/slow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 60);
    await expect(pending).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(observed).toBe(true);
  });
});
