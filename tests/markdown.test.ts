import { describe, expect, it } from 'vitest';
import { isMermaidLanguage, isSvgLanguage, prepareMarkdown, toPlainText } from '../shared/markdown';

describe('prepareMarkdown — maths delimiters', () => {
  it('converts \\[ ... \\] to display maths', () => {
    const output = prepareMarkdown('Before\n\\[ x^2 + y^2 = z^2 \\]\nAfter');
    expect(output).toContain('$$\nx^2 + y^2 = z^2\n$$');
    expect(output).not.toContain('\\[');
  });

  it('converts \\( ... \\) to inline maths', () => {
    expect(prepareMarkdown('the value \\( x_i \\) matters')).toContain('$x_i$');
  });

  it('handles over-escaped delimiters from JSON round-trips', () => {
    expect(prepareMarkdown('area \\\\[ \\pi r^2 \\\\]')).toContain('$$\n\\pi r^2\n$$');
  });
});

describe('prepareMarkdown — escaped LaTeX', () => {
  it('collapses double-escaped commands inside maths', () => {
    expect(prepareMarkdown('$$\\\\frac{a}{b}$$')).toBe('$$\\frac{a}{b}$$');
  });

  it('collapses double-escaped commands in prose and wraps them in maths', () => {
    const output = prepareMarkdown('The \\\\frac{a}{b} ratio grows');
    expect(output).toBe('The $\\frac{a}{b}$ ratio grows');
  });

  it('preserves \\\\ row breaks inside a matrix', () => {
    const source = '$$\\begin{pmatrix} a \\\\ b \\end{pmatrix}$$';
    expect(prepareMarkdown(source)).toBe(source);
  });

  it('leaves an environment that is already inside display maths untouched', () => {
    const source = '$$\\mathbf{r}(t) = \\begin{bmatrix} x(t) \\\\ y(t) \\\\ z(t) \\end{bmatrix}$$';
    expect(prepareMarkdown(source)).toBe(source);
  });

  it('handles maths spans on both sides of a currency amount', () => {
    const source = 'A $12 receiver tracking $f_{L1}$ and $f_{L2}$ signals.';
    const output = prepareMarkdown(source);
    expect(output).toContain('\\$12');
    expect(output).toContain('$f_{L1}$');
    expect(output).toContain('$f_{L2}$');
  });

  it('wraps a bare environment that would otherwise render as source', () => {
    const output = prepareMarkdown('Solve:\n\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}\nDone');
    expect(output).toMatch(/\$\$\n\\begin\{aligned\}[\s\S]*\\end\{aligned\}\n\$\$/);
  });

  it('wraps a stray macro without swallowing the sentence', () => {
    const output = prepareMarkdown('Because \\Delta t is small, the error stays low.');
    expect(output).toContain('$\\Delta$');
    expect(output).toContain('is small, the error stays low.');
  });

  it('leaves ordinary prose untouched', () => {
    const prose = 'A plain sentence with **bold** text and a [link](https://example.com).';
    expect(prepareMarkdown(prose)).toBe(prose);
  });
});

describe('prepareMarkdown — currency', () => {
  it('escapes money so it is not parsed as maths', () => {
    const output = prepareMarkdown('It costs $20 and then $30 more.');
    expect(output).toBe('It costs \\$20 and then \\$30 more.');
  });

  it('keeps real inline maths that starts with a digit', () => {
    expect(prepareMarkdown('the ratio $2x + 1$ holds')).toBe('the ratio $2x + 1$ holds');
  });

  it('does not double-escape already escaped currency', () => {
    expect(prepareMarkdown('costs \\$5 today')).toBe('costs \\$5 today');
  });

  it('does not let a distant maths span swallow a sentence of prose', () => {
    const output = prepareMarkdown(
      'Satellites carry $100,000 atomic clocks, but phones use quartz, which adds an offset $\\Delta t$.',
    );
    expect(output).toContain('\\$100,000');
    expect(output).toContain('$\\Delta t$');
    // Balanced delimiters: no orphaned dollar left behind.
    expect((output.match(/(?<!\\)\$/g) ?? []).length % 2).toBe(0);
  });

  it('keeps units written as LaTeX inside maths', () => {
    expect(prepareMarkdown('orbit at $20,200 \\text{ km}$ altitude')).toBe('orbit at $20,200 \\text{ km}$ altitude');
  });
});

describe('prepareMarkdown — code', () => {
  it('never touches fenced code', () => {
    const source = ['```python', 'total = f"${amount} and \\frac"', 'x = a \\\\ b', '```'].join('\n');
    expect(prepareMarkdown(source)).toBe(source);
  });

  it('never touches inline code', () => {
    expect(prepareMarkdown('run `pip install $PKG \\frac` first')).toBe('run `pip install $PKG \\frac` first');
  });

  it('keeps mermaid and svg fences intact', () => {
    const mermaid = '```mermaid\nflowchart TD\n  A["Signal (L1)"] --> B["Receiver"]\n```';
    expect(prepareMarkdown(mermaid)).toBe(mermaid);
    const svg = '```svg\n<svg viewBox="0 0 10 10"><path d="M0 0 L10 10"/></svg>\n```';
    expect(prepareMarkdown(svg)).toBe(svg);
  });
});

describe('prepareMarkdown — robustness', () => {
  it('handles empty and nullish input', () => {
    expect(prepareMarkdown('')).toBe('');
    expect(prepareMarkdown(null)).toBe('');
    expect(prepareMarkdown(undefined)).toBe('');
  });

  it('unescapes literal \\n only when there are no real newlines', () => {
    expect(prepareMarkdown('line one\\nline two')).toBe('line one\nline two');
    expect(prepareMarkdown('real\nnewline and \\nabla')).toContain('\\nabla');
  });

  it('is idempotent enough to survive a second pass', () => {
    const once = prepareMarkdown('The \\\\frac{a}{b} ratio and $20');
    expect(prepareMarkdown(once)).toBe(once);
  });

  it('does not hang on pathological input', () => {
    const nasty = `${'\\frac{'.repeat(200)}x${'}'.repeat(200)} $${'\\\\'.repeat(100)}$`;
    const started = Date.now();
    expect(() => prepareMarkdown(nasty)).not.toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('language detection', () => {
  it('spots mermaid by tag or by content', () => {
    expect(isMermaidLanguage('mermaid', 'flowchart TD')).toBe(true);
    expect(isMermaidLanguage(undefined, 'sequenceDiagram\n A->>B: hi')).toBe(true);
    expect(isMermaidLanguage('python', 'graph TD')).toBe(false);
  });

  it('spots svg by tag or by content', () => {
    expect(isSvgLanguage('svg', '<svg></svg>')).toBe(true);
    expect(isSvgLanguage('xml', '<svg viewBox="0 0 1 1"></svg>')).toBe(true);
    expect(isSvgLanguage(undefined, 'not svg')).toBe(false);
  });
});

describe('toPlainText', () => {
  it('flattens markdown for prompts and exports', () => {
    const output = toPlainText('# Title\n\n- **bold** item\n\n```js\ncode\n```\n\n[link](https://x.com)');
    expect(output).toContain('Title');
    expect(output).toContain('• bold item');
    expect(output).toContain('[code]');
    expect(output).toContain('link');
    expect(output).not.toContain('https://x.com');
  });

  it('truncates long input', () => {
    expect(toPlainText('a'.repeat(500), 100).length).toBeLessThanOrEqual(101);
  });
});
