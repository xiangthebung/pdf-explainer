/**
 * Stands in for `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url` under vitest.
 *
 * In a browser build that import yields a URL the server can hand back, and
 * pdf.js fetches it. Under vitest the same import yields the root-relative
 * `/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs`, which pdf.js then
 * resolves against the filesystem root and reports as
 * "Cannot find module 'C:\node_modules\...'".
 *
 * A `file://` URL to the worker that is actually installed fixes it, and has the
 * side benefit that the suite now drives the same legacy worker a visitor gets
 * rather than falling through to pdf.js's in-process path.
 *
 * Wired up by the alias in vite.config.ts.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default pathToFileURL(
  path.resolve(
    import.meta.dirname,
    '..',
    'node_modules',
    'pdfjs-dist',
    'legacy',
    'build',
    'pdf.worker.min.mjs',
  ),
).href;
