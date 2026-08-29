// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  closeDocument,
  getPageText,
  openDocument,
  searchDocument,
  type PDFDocumentProxy,
} from '../src/lib/pdf';

/**
 * Runs against the generated fixture decks (`npm run fixtures`), so the text
 * layer, search and page-count paths are exercised on real PDFs rather than a
 * mock.
 */
const FIXTURES = join(__dirname, 'fixtures');

// In the browser the worker comes from the bundle (`?url`); under Node there is
// no `Worker`, so point pdf.js at the module on disk and let it run in-process.
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
).href;

function load(name: string): string {
  return bytesToBase64(new Uint8Array(readFileSync(join(FIXTURES, name))));
}

async function withDoc<T>(name: string, run: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const doc = await openDocument(load(name));
  try {
    return await run(doc);
  } finally {
    await closeDocument(doc);
  }
}

describe('base64 round-trip', () => {
  it('survives a multi-megabyte buffer without blowing the stack', () => {
    const bytes = new Uint8Array(3_000_000);
    for (let i = 0; i < bytes.length; i += 7) bytes[i] = i % 251;
    const restored = base64ToBytes(bytesToBase64(bytes));
    expect(restored.length).toBe(bytes.length);
    expect(restored[0]).toBe(bytes[0]);
    expect(restored[2_999_999]).toBe(bytes[2_999_999]);
  });

  it('accepts a data URL prefix', () => {
    const bytes = base64ToBytes('data:application/pdf;base64,JVBERi0=');
    expect(new TextDecoder().decode(bytes)).toBe('%PDF-');
  });
});

describe('opening decks', () => {
  it('reads the page count of each fixture', async () => {
    await withDoc('normal-text.pdf', async (doc) => expect(doc.numPages).toBe(6));
    await withDoc('dense-math.pdf', async (doc) => expect(doc.numPages).toBe(4));
    await withDoc('code-diagrams.pdf', async (doc) => expect(doc.numPages).toBe(4));
    await withDoc('long-deck.pdf', async (doc) => expect(doc.numPages).toBe(120));
    await withDoc('no-text-layer.pdf', async (doc) => expect(doc.numPages).toBe(3));
  }, 60_000);

  /**
   * These four used to be one bucket.
   *
   * Everything that is not a readable PDF raises `InvalidPDFException`, so a PNG
   * renamed to `.pdf`, a zero-byte file and a genuinely damaged deck all came back
   * as "This file is not a readable PDF. It may be corrupted." That is vague for
   * two of them and wrong for the third: it tells someone who picked the wrong
   * file to go and re-export the right one.
   *
   * The old test asserted only `rejects.toThrow()`, which passes for every
   * message including the wrong one — which is why the misclassification survived
   * having a test pointed at it. These assert the reason.
   */
  it('names a file that is not a PDF as not a PDF, rather than as corrupt', async () => {
    await expect(
      openDocument(bytesToBase64(new TextEncoder().encode('this is not a pdf'))),
    ).rejects.toMatchObject({ reason: 'not-pdf' });
  });

  it('classifies a renamed image by its bytes, not its extension', async () => {
    // A real PNG signature followed by nothing that matters.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    await expect(openDocument(bytesToBase64(png))).rejects.toMatchObject({ reason: 'not-pdf' });
  });

  it('calls an empty file empty', async () => {
    await expect(openDocument('')).rejects.toMatchObject({ reason: 'empty' });
  });

  it('still calls a damaged PDF corrupt', async () => {
    /* Truncation keeps the `%PDF-` header, so this is the case the header check
       must not swallow: it has to reach pdf.js and come back as corrupt. */
    const whole = new Uint8Array(readFileSync(join(FIXTURES, 'normal-text.pdf')));
    const half = whole.subarray(0, Math.floor(whole.length / 2));
    await expect(openDocument(bytesToBase64(half))).rejects.toMatchObject({ reason: 'corrupt' });
  }, 30_000);

  it('accepts a PDF whose header is not at byte zero', async () => {
    /* pdf.js scans the first kilobyte for the header, so the guard has to as
       well. A stricter check would reject files that would otherwise open. */
    const whole = new Uint8Array(readFileSync(join(FIXTURES, 'normal-text.pdf')));
    const padded = new Uint8Array(whole.length + 8);
    padded.set(new TextEncoder().encode('\n\n\n\n\n\n\n\n'), 0);
    padded.set(whole, 8);
    const doc = await openDocument(bytesToBase64(padded));
    expect(doc.numPages).toBe(6);
    await closeDocument(doc);
  }, 30_000);

  it('honours an abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(openDocument(load('normal-text.pdf'), controller.signal)).rejects.toThrow();
  });
});

describe('text extraction', () => {
  it('pulls readable text out of an ordinary slide', async () => {
    await withDoc('normal-text.pdf', async (doc) => {
      const text = await getPageText(doc, 2);
      expect(text).toContain('Four Families of Receptor');
      expect(text).toContain('tyrosine kinases');
      // Layout heuristics should keep bullets on separate lines.
      expect(text.split('\n').length).toBeGreaterThan(3);
    });
  }, 30_000);

  it('caches per page and per document', async () => {
    await withDoc('dense-math.pdf', async (doc) => {
      const first = await getPageText(doc, 2);
      const second = await getPageText(doc, 2);
      expect(second).toBe(first);
      expect(first).toContain('normal equations');
    });
  }, 30_000);

  it('keeps code listings legible', async () => {
    await withDoc('code-diagrams.pdf', async (doc) => {
      const text = await getPageText(doc, 1);
      expect(text).toContain('ThreadPoolExecutor');
      expect(text).toContain('def fetch');
    });
  }, 30_000);

  it('returns empty text for a slide with no text layer', async () => {
    await withDoc('no-text-layer.pdf', async (doc) => {
      expect(await getPageText(doc, 1)).toBe('');
    });
  }, 30_000);
});

describe('search', () => {
  it('finds a term deep in a long deck and reports the slide', async () => {
    await withDoc('long-deck.pdf', async (doc) => {
      const hits: number[] = [];
      for await (const hit of searchDocument(doc, 'telegraphy')) hits.push(hit.page);
      expect(hits).toEqual([87]);
    });
  }, 120_000);

  it('yields snippets and counts, and is case-insensitive', async () => {
    await withDoc('normal-text.pdf', async (doc) => {
      const hits = [];
      for await (const hit of searchDocument(doc, 'RECEPTOR')) hits.push(hit);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].snippet.toLowerCase()).toContain('receptor');
      expect(hits[0].matches).toBeGreaterThan(0);
    });
  }, 60_000);

  it('stops when the caller aborts', async () => {
    await withDoc('long-deck.pdf', async (doc) => {
      const controller = new AbortController();
      const pages: number[] = [];
      for await (const hit of searchDocument(doc, 'Topic', controller.signal)) {
        pages.push(hit.page);
        if (pages.length === 2) controller.abort();
      }
      expect(pages).toHaveLength(2);
    });
  }, 60_000);

  it('ignores queries that are too short to be useful', async () => {
    await withDoc('normal-text.pdf', async (doc) => {
      const hits = [];
      for await (const hit of searchDocument(doc, 'a')) hits.push(hit);
      expect(hits).toEqual([]);
    });
  }, 30_000);
});
