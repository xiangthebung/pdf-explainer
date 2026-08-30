import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_SECURITY_HEADERS, CONTENT_SECURITY_POLICY, headersFileBody, securityHeaders } from '../server/headers';

/**
 * More shape assertions, in the spirit of `deployTarget.test.ts`.
 *
 * A CSP is only as good as the thing it does not have to make an exception for,
 * and every exception starts as someone adding a `<script>` or a CDN link and
 * finding the page still works — in development, where the policy is off. These
 * pin the two ways that goes wrong: an inline script that would need a hash, and
 * a cross-origin URL that would need a host in the policy.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

function directive(name: string): string {
  const found = CONTENT_SECURITY_POLICY.split('; ').find((entry) => entry.startsWith(`${name} `));
  return found ?? '';
}

describe('the content security policy', () => {
  it('locks the defaults to this origin', () => {
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('connect-src')).toBe("connect-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'none'");
  });

  it('allows no inline or evaluated script', () => {
    const scriptSrc = directive('script-src');
    expect(scriptSrc).toBe("script-src 'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('names no external host anywhere', () => {
    // Everything this app loads is bundled: the pdf.js worker, KaTeX and its
    // fonts, Mermaid. A host appearing here means something started reaching
    // out over the network.
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:\/\//);
  });
});

describe('index.html stays inside the policy', () => {
  const html = read('index.html');

  it('has no inline script, which would need its hash in the policy', () => {
    /*
     * The pre-paint theme switch used to live here as an inline block. Hashing
     * it does not work: Vite minifies inline scripts when it builds the HTML, so
     * a hash taken from this file is right in development and wrong in
     * production. It is public/theme.js instead, which `script-src 'self'`
     * already covers.
     */
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    expect(inline).toEqual([]);
  });

  it('loads the theme switch before paint, from this origin', () => {
    expect(html).toContain('<script src="/theme.js"></script>');
    // Not deferred, or the flash it exists to prevent comes back.
    expect(html).not.toMatch(/<script[^>]*theme\.js[^>]*\b(defer|async)\b/i);
  });

  it('references nothing cross-origin', () => {
    /*
     * Subresources only, which is what the policy is about. `<link
     * rel="canonical">` also carries an href and is deliberately absolute: it
     * declares this page's own address for a crawler and loads nothing, so
     * matching it here would be reading the attribute rather than the
     * behaviour. Everything the browser actually fetches still has to come from
     * this origin — including the Open Graph image, which is why its `content`
     * URL points back here too.
     */
    const subresources = html.replace(/<link\b[^>]*\brel="canonical"[^>]*>/gi, '');
    const urls = [...subresources.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).not.toMatch(/^(?:https?:)?\/\//);
  });
});

describe('the headers both targets set', () => {
  it('includes the CSP in production and leaves it out in development', () => {
    // Vite's dev server injects its HMR client inline; the strict policy would
    // break `npm run dev` and nothing else.
    expect(securityHeaders(true)['Content-Security-Policy']).toBe(CONTENT_SECURITY_POLICY);
    expect(securityHeaders(false)['Content-Security-Policy']).toBeUndefined();
  });

  it('sets the cheap ones everywhere', () => {
    for (const target of [securityHeaders(true), securityHeaders(false)]) {
      expect(target['X-Content-Type-Options']).toBe('nosniff');
      expect(target['Referrer-Policy']).toBe('no-referrer');
      expect(target['X-Frame-Options']).toBe('DENY');
    }
    expect(Object.keys(BASE_SECURITY_HEADERS).length).toBeGreaterThan(3);
  });

  it('reaches the document, which is the only response a CSP acts on', () => {
    /*
     * The mistake worth pinning. Setting these in `worker/index.ts` looks like
     * it covers everything and covers almost nothing: `run_worker_first` in
     * wrangler.jsonc is `["/api/*"]`, so Cloudflare's asset handler answers
     * every document *before* the Worker is invoked. The first version of this
     * change shipped the policy on the JSON replies nobody renders and left the
     * HTML that runs scripts bare.
     *
     * `_headers` is what the asset handler reads, so that is what has to carry
     * the policy — and it has to be generated from the same constants, or the
     * two copies drift and only one of them is the one in force.
     */
    const body = headersFileBody();
    expect(body.split('\n')[1]).toBe('/*');
    expect(body).toContain(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`);
    for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
      expect(body, `${name} is missing from _headers`).toContain(`  ${name}: ${value}`);
    }
  });

  it('is emitted into the built client by the Vite build', () => {
    // Without this the file is never written and the policy is not deployed.
    const config = read('vite.config.ts');
    expect(config).toContain('headersFileBody');
    expect(config).toMatch(/fileName:\s*'_headers'/);
  });

  it('is set by the Worker too, for anything that does reach it', () => {
    const worker = read('worker/index.ts');
    expect(worker).toMatch(/withSecurityHeaders\(await env\.ASSETS\.fetch\(request\)\)/);
  });

  it('is applied by the Express server to everything, before the routes', () => {
    const server = read('server/index.ts');
    const headersAt = server.indexOf('securityHeaders(config.isProduction)');
    const apiAt = server.indexOf("app.use('/api', createApiRouter())");
    expect(headersAt).toBeGreaterThan(-1);
    expect(apiAt).toBeGreaterThan(headersAt);
  });
});
