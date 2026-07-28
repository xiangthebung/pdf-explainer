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

  it('rejects a file that is not a PDF', async () => {
    await expect(openDocument(bytesToBase64(new TextEncoder().encode('this is not a pdf')))).rejects.toThrow();
  });

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
