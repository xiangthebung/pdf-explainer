// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { sanitizeSvg } from '../src/lib/sanitizeSvg';
import { repairMermaid } from '../src/lib/mermaid';

describe('sanitizeSvg', () => {
  it('keeps ordinary drawing markup', () => {
    const result = sanitizeSvg('<svg viewBox="0 0 100 50"><path d="M0 0 L100 50" stroke="currentColor"/></svg>');
    expect(result).not.toBeNull();
    expect(result?.markup).toContain('<path');
    expect(result?.markup).toContain('stroke="currentColor"');
    expect(result?.hasViewBox).toBe(true);
  });

  it('removes scripts and event handlers', () => {
    const result = sanitizeSvg(
      `<svg viewBox="0 0 10 10">
         <script>alert(1)</script>
         <rect width="10" height="10" onload="alert(2)" onclick="steal()"/>
       </svg>`,
    );
    expect(result?.markup).not.toMatch(/script/i);
    expect(result?.markup).not.toMatch(/onload|onclick|alert/i);
    expect(result?.markup).toContain('<rect');
  });

  it('removes foreignObject, which can smuggle arbitrary HTML', () => {
    const result = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><foreignObject><body><img src="x" onerror="go()"/></body></foreignObject></svg>',
    );
    expect(result?.markup).not.toMatch(/foreignObject|<img|onerror|<body/i);
  });

  it('drops external references but keeps fragment references', () => {
    const result = sanitizeSvg(
      `<svg viewBox="0 0 10 10">
         <defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
         <a href="https://evil.example"><rect width="4" height="4" fill="url(#g)"/></a>
         <use href="#g"/>
       </svg>`,
    );
    expect(result?.markup).not.toContain('evil.example');
    expect(result?.markup).toContain('href="#g"');
  });

  it('strips url() and @import from inline styles', () => {
    const result = sanitizeSvg(
      `<svg viewBox="0 0 10 10">
         <style>@import url(https://evil.example/x.css); .a { fill: red }</style>
         <rect width="4" height="4" style="fill:url(https://evil.example/x.png)"/>
       </svg>`,
    );
    expect(result?.markup).not.toContain('evil.example');
    expect(result?.markup).not.toContain('@import');
    expect(result?.markup).toContain('.a');
  });

  it('makes the root responsive, synthesising a viewBox when needed', () => {
    const result = sanitizeSvg('<svg width="400" height="200"><circle cx="10" cy="10" r="5"/></svg>');
    expect(result?.markup).toContain('viewBox="0 0 400 200"');
    expect(result?.markup).not.toMatch(/width="400"/);
    expect(result?.markup).not.toMatch(/height="200"/);
    expect(result?.hasViewBox).toBe(true);
  });

  it('recovers from malformed XML using the HTML parser', () => {
    const result = sanitizeSvg('<svg viewBox="0 0 10 10"><rect width="4" height="4"><circle r="2"></svg>');
    expect(result).not.toBeNull();
    expect(result?.markup).toContain('<rect');
  });

  it('parses malformed markup somewhere that cannot load anything', () => {
    /*
     * The forgiving-parser fallback is entered whenever DOMParser reports a
     * parsererror, and one unclosed tag is enough to get there — so anything
     * shaping the model's output picks this path at will. It used to parse into
     * `document.createElement('div')`, which belongs to the live document, and a
     * browser fetches `<img src>` in a document-owned subtree whether or not it
     * is attached: `onerror` fires during the parse, before `scrub` sees a
     * single attribute. jsdom will not show that, so what is pinned here is the
     * cause rather than the symptom — the live document is never the host.
     */
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"><img src="x" onerror="steal()"></svg>';

    const parsed = new DOMParser().parseFromString(hostile, 'image/svg+xml');
    expect(parsed.getElementsByTagName('parsererror').length).toBeGreaterThan(0);

    const createElement = vi.spyOn(document, 'createElement');
    try {
      const result = sanitizeSvg(hostile);
      expect(createElement).not.toHaveBeenCalled();
      expect(result?.markup).toContain('<rect');
      expect(result?.markup).not.toMatch(/<img|onerror|steal/i);
    } finally {
      createElement.mockRestore();
    }
  });

  it('unwraps a markdown fence and ignores leading prose', () => {
    const result = sanitizeSvg('```svg\nHere it is: <svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>\n```');
    expect(result?.markup.startsWith('<svg')).toBe(true);
  });

  it('returns null when there is no SVG at all', () => {
    expect(sanitizeSvg('just text')).toBeNull();
    expect(sanitizeSvg('<div>not svg</div>')).toBeNull();
    expect(sanitizeSvg('')).toBeNull();
  });
});

describe('repairMermaid', () => {
  it('quotes labels that contain parentheses or slashes', () => {
    const repaired = repairMermaid('flowchart TD\n  A[Signal (L1/L2)] --> B[Receiver]');
    expect(repaired).toContain('A["Signal (L1/L2)"]');
    // A label with nothing special stays untouched.
    expect(repaired).toContain('B[Receiver]');
  });

  it('leaves already-quoted labels alone', () => {
    const source = 'flowchart TD\n  A["Already (quoted)"] --> B';
    expect(repairMermaid(source)).toBe(source);
  });

  it('quotes decision nodes that need it', () => {
    expect(repairMermaid('flowchart TD\n  A{Is x/y > 1?}')).toContain('A{"Is x/y > 1?"}');
  });

  it('strips markdown fences', () => {
    expect(repairMermaid('```mermaid\nflowchart TD\n  A --> B\n```')).toBe('flowchart TD\n  A --> B');
  });
});
