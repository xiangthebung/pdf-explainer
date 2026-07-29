/*
 * pdf.js, legacy build, on both the main thread and in the worker.
 *
 * The modern build calls `Uint8Array.prototype.toHex`, which is a Stage 3
 * proposal that arrived in Chrome 140, Safari 18.2 and Firefox 133. Anything
 * older gets `UnknownErrorException: a.toHex is not a function` and the app shows
 * "This deck will not open" for every PDF, including its own demo deck. Measured
 * in real browsers: Chrome 139 has no `toHex` and cannot open a deck; Chrome 150
 * can.
 *
 * Both imports have to move together. The failure surfaces as an
 * `UnknownErrorException`, which is how pdf.js reports something that went wrong
 * inside the worker, so redirecting only the bare specifier above would leave the
 * modern worker in place and the bug exactly where it was.
 *
 * Cost of the legacy build, minified: about 56 KB on the entry and 48 KB on the
 * worker. Using it is what pdf.js documents for environments without the newest
 * built-ins, and it is a better trade than an app that cannot open a file on last
 * year's browser.
 *
 * Types still come from the package root; the legacy entry ships an empty
 * declaration file.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/**
 * PDF engine.
 *
 * The worker ships with the bundle rather than being pulled from a CDN: one
 * fewer third party in the path, and the app keeps working offline.
 *
 * Lifecycle is the fragile part of pdf.js, so it is all in one place here:
 * loading tasks are destroyed on abort, render tasks are cancelled before a new
 * one starts, and the caches are bounded and owned per document.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfSource {
  /** Raw base64 (no data-url prefix). Kept so we can re-open or re-send it. */
  base64: string;
  name: string;
  bytes: number;
}

export class PdfLoadError extends Error {
  readonly reason: 'password' | 'corrupt' | 'empty' | 'unknown';
  constructor(reason: PdfLoadError['reason'], message: string) {
    super(message);
    this.name = 'PdfLoadError';
    this.reason = reason;
  }
}

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function readPdfFile(file: File): Promise<PdfSource> {
  const buffer = await file.arrayBuffer();
  return {
    base64: bytesToBase64(new Uint8Array(buffer)),
    name: file.name.replace(/\.pdf$/i, ''),
    bytes: buffer.byteLength,
  };
}

/**
 * Open a document. pdf.js takes ownership of (and detaches) the buffer it is
 * given, so every call gets its own copy.
 */
export async function openDocument(base64: string, signal?: AbortSignal): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: base64ToBytes(base64),
    // Keep the renderer self-contained: no CDN fetches for fonts or standard data.
    useSystemFonts: true,
    useWorkerFetch: false,
  });

  const onAbort = () => {
    void task.destroy();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const doc = await task.promise;
    if (signal?.aborted) {
      await closeDocument(doc);
      throw new DOMException('Aborted', 'AbortError');
    }
    if (doc.numPages < 1) throw new PdfLoadError('empty', 'That PDF has no pages.');
    return doc;
  } catch (error) {
    if (error instanceof PdfLoadError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const name = (error as { name?: string }).name;
    if (name === 'PasswordException') {
      throw new PdfLoadError('password', 'This PDF is password protected. Remove the password and try again.');
    }
    if (name === 'InvalidPDFException') {
      throw new PdfLoadError('corrupt', 'This file is not a readable PDF. It may be corrupted.');
    }
    // The user-facing message stays generic; the detail goes to the console so a
    // real failure is diagnosable.
    console.warn('PDF failed to open:', name ?? 'Error', (error as { message?: string }).message);
    throw new PdfLoadError('unknown', 'Could not open that PDF.');
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Tear a document down. Destroying the loading task is what actually releases
 * the worker and the (detached) source buffer; `cleanup` alone does not.
 */
export async function closeDocument(doc: PDFDocumentProxy | null | undefined): Promise<void> {
  if (!doc) return;
  try {
    await doc.cleanup();
  } catch {
    /* already torn down */
  }
  try {
    await doc.loadingTask.destroy();
  } catch {
    /* already torn down */
  }
}

/* -------------------------------------------------------------------------- */
/* rendering                                                                   */
/* -------------------------------------------------------------------------- */

export interface FitResult {
  scale: number;
  cssWidth: number;
  cssHeight: number;
}

/** Scale a page to fit the available box, then apply the user's zoom. */
export function fitPage(page: PDFPageProxy, box: { width: number; height: number }, zoom: number): FitResult {
  const base = page.getViewport({ scale: 1 });
  const fit = Math.min(box.width / base.width, box.height / base.height);
  const scale = Math.max(0.05, fit * zoom);
  return { scale, cssWidth: base.width * scale, cssHeight: base.height * scale };
}

export interface RenderHandle {
  cancel(): void;
  done: Promise<void>;
}

/**
 * Render one page into a canvas. The returned handle cancels the underlying
 * pdf.js render task, which is what stops the "two renders on one canvas"
 * exception when the user flicks through slides.
 */
export function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  options: { scale: number; maxPixelRatio?: number },
): RenderHandle {
  const ratio = Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2);
  const viewport = page.getViewport({ scale: options.scale * ratio });
  const cssViewport = page.getViewport({ scale: options.scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(cssViewport.width)}px`;
  canvas.style.height = `${Math.floor(cssViewport.height)}px`;

  const task = page.render({ canvas, viewport });
  return {
    cancel() {
      try {
        task.cancel();
      } catch {
        /* already finished */
      }
    },
    done: task.promise.catch((error: unknown) => {
      const name = (error as { name?: string }).name;
      if (name === 'RenderingCancelledException' || name === 'AbortError') return;
      throw error;
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* text, thumbnails, search                                                    */
/* -------------------------------------------------------------------------- */

interface DocumentCaches {
  text: Map<number, string>;
  thumbs: Map<number, string>;
  pending: Map<number, Promise<string>>;
}

const caches = new WeakMap<PDFDocumentProxy, DocumentCaches>();

function cachesFor(doc: PDFDocumentProxy): DocumentCaches {
  let entry = caches.get(doc);
  if (!entry) {
    entry = { text: new Map(), thumbs: new Map(), pending: new Map() };
    caches.set(doc, entry);
  }
  return entry;
}

/** Extracted text for one page, with the layout roughly preserved. */
export async function getPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const store = cachesFor(doc);
  const cached = store.text.get(pageNumber);
  if (cached !== undefined) return cached;

  const inFlight = store.pending.get(pageNumber);
  if (inFlight) return inFlight;

  const task = (async () => {
    try {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = '';
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) text += '\n';
        else if (text && !text.endsWith(' ') && !text.endsWith('\n')) text += ' ';
        text += item.str;
        lastY = y;
      }
      const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      store.text.set(pageNumber, clean);
      return clean;
    } catch {
      store.text.set(pageNumber, '');
      return '';
    } finally {
      store.pending.delete(pageNumber);
    }
  })();

  store.pending.set(pageNumber, task);
  return task;
}

const THUMB_LIMIT = 60;

/** Small PNG data URL for the filmstrip. Cached per document, bounded in size. */
export async function getThumbnail(doc: PDFDocumentProxy, pageNumber: number, width = 168): Promise<string> {
  const store = cachesFor(doc);
  const cached = store.thumbs.get(pageNumber);
  if (cached) return cached;

  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(width / base.width, 1);
  const viewport = page.getViewport({ scale: scale * Math.min(window.devicePixelRatio || 1, 2) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  try {
    await page.render({ canvas, viewport }).promise;
    const url = canvas.toDataURL('image/png');
    if (store.thumbs.size >= THUMB_LIMIT) {
      const oldest = store.thumbs.keys().next().value;
      if (oldest !== undefined) store.thumbs.delete(oldest);
    }
    store.thumbs.set(pageNumber, url);
    return url;
  } finally {
    // Free the backing store immediately; Safari is slow to collect canvases.
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

export interface SearchHit {
  page: number;
  snippet: string;
  matches: number;
}

/**
 * Search the deck's text layer. Yields progressively so a 300-slide deck still
 * feels responsive, and stops as soon as the caller aborts.
 */
export async function* searchDocument(
  doc: PDFDocumentProxy,
  query: string,
  signal?: AbortSignal,
): AsyncGenerator<SearchHit> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return;

  for (let page = 1; page <= doc.numPages; page += 1) {
    if (signal?.aborted) return;
    const text = await getPageText(doc, page);
    if (!text) continue;
    const haystack = text.toLowerCase();
    let index = haystack.indexOf(needle);
    if (index === -1) continue;

    let matches = 0;
    while (index !== -1) {
      matches += 1;
      index = haystack.indexOf(needle, index + needle.length);
    }

    const first = haystack.indexOf(needle);
    const start = Math.max(0, first - 42);
    const end = Math.min(text.length, first + needle.length + 68);
    const snippet = `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${
      end < text.length ? '…' : ''
    }`;
    yield { page, snippet, matches };
  }
}
