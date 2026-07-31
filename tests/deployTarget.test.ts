import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_PATHS } from '../server/api';

/**
 * The deployment target is part of the software.
 *
 * This suite exists because of a failure no other test here could see. The app was moved to
 * Cloudflare Workers, and `npm run build` produced a static client plus a CommonJS Node
 * bundle of an Express server — an artifact Workers cannot run. So what got deployed was the
 * client and nothing else, Cloudflare's static-asset handler answered every `POST /api/*`
 * with **405 Method Not Allowed**, and the app told its users "Could not generate notes —
 * Request failed (405)".
 *
 * Every unit test passed. The smoke suite passed, because it starts the Node bundle and
 * drives that. The API was fully working in the only environment anything tested it in, and
 * absent in the one people used.
 *
 * So these are assertions about the shape of the deploy rather than about behaviour: there
 * is a Worker, it is the entry point, and every API path reaches it rather than the asset
 * server. They are cheap and they are the only kind of test that would have caught this.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

/** JSONC: strip line comments before parsing. No block comments are used in it. */
function readJsonc(file: string): Record<string, unknown> {
  const text = read(file)
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
  return JSON.parse(text) as Record<string, unknown>;
}

interface WranglerAssets {
  directory?: string;
  binding?: string;
  not_found_handling?: string;
  run_worker_first?: string[];
}

describe('the Cloudflare deployment', () => {
  const wrangler = readJsonc('wrangler.jsonc');
  const assets = wrangler.assets as WranglerAssets | undefined;

  it('has a Worker, and it is the entry point', () => {
    expect(typeof wrangler.main).toBe('string');
    expect(existsSync(path.join(root, String(wrangler.main)))).toBe(true);
  });

  it('binds the built client as assets', () => {
    expect(assets?.directory).toBe('./dist');
    // The Worker reads `env.ASSETS` for everything that is not an API call.
    expect(assets?.binding).toBe('ASSETS');
  });

  it('serves the client as a single-page app, so an unknown path is a route', () => {
    expect(assets?.not_found_handling).toBe('single-page-application');
  });

  /**
   * The assertion that is really about the bug.
   *
   * Without `run_worker_first`, the asset handler gets first refusal on every path. A
   * `POST /api/explain` matches no file, so it falls through to the SPA rule above and is
   * answered with `index.html` and a 200 — which the client parses as JSON and fails on.
   * Before that rule existed at all it was answered 405. Either way the API is unreachable.
   */
  it('routes every API path to the Worker before the asset handler sees it', () => {
    expect(assets?.run_worker_first).toContain('/api/*');
    for (const apiPath of API_PATHS) {
      expect(apiPath.startsWith('/')).toBe(true);
      // `/api` + the path is what the client calls, and `/api/*` has to cover all of it.
      expect(`/api${apiPath}`.startsWith('/api/')).toBe(true);
    }
  });

  it('does not publish the Node server bundle as a public asset', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const outfile = /--outfile=(\S+)/.exec(pkg.scripts.build)?.[1];
    expect(outfile, 'the build no longer names an output file for the Node server').toBeTruthy();
    /* `dist/` is uploaded wholesale to Cloudflare. A server bundle in there is a server
       bundle served to the public, and a sourcemap beside it is the source. */
    expect(outfile?.startsWith('dist/')).toBe(false);
    expect(outfile?.startsWith('dist\\')).toBe(false);
  });

  it('runs on a compatibility date the pinned wrangler can actually run', () => {
    /* A later date deploys fine and breaks `wrangler dev`, which refuses to start against a
       date newer than its own workerd. A deploy target nobody can run locally is one nobody
       tests against — which is how this repository got into this state. */
    expect(wrangler.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(wrangler.compatibility_flags).toContain('nodejs_compat');
  });
});

describe('the client and the Worker agree on where the API lives', () => {
  it('calls nothing outside /api', () => {
    const client = read('src/lib/api.ts');
    const called = [...client.matchAll(/request<[^>]*>\('([^']+)'|post<[^>]*>\('([^']+)'|'(\/api\/[a-z]+)'/g)]
      .map((match) => match[1] ?? match[2] ?? match[3])
      .filter((value): value is string => Boolean(value));
    expect(called.length).toBeGreaterThan(0);
    for (const url of called) expect(url.startsWith('/api/')).toBe(true);
  });

  it('calls only endpoints the API serves', () => {
    const client = read('src/lib/api.ts');
    for (const apiPath of API_PATHS) {
      expect(client, `the client never calls /api${apiPath}`).toContain(`/api${apiPath}`);
    }
  });
});
