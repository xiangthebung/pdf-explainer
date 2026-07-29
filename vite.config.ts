import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    target: 'es2022',
    // Code splitting is left to Rollup: the app's own dynamic imports (the
    // workspace, Mermaid, the demo deck, pdf.js) already draw the right lines,
    // and hand-grouping vendors pulled Mermaid back into the entry graph.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    /**
     * pdf.js, but the build meant for Node.
     *
     * The modern build calls `Uint8Array.prototype.toHex`, which no released Node
     * has yet — on Node 24.18 it is `undefined` — so every test that opened a
     * document died on `UnknownErrorException: a.toHex is not a function`, nine of
     * them, while pdf.js printed "Please use the `legacy` build in Node.js
     * environments" into stderr and nobody read it.
     *
     * Scoped to `test` rather than added to `resolve.alias`, because the browser
     * should keep getting the modern build: it is smaller, and the API it wants is
     * there in every browser this app supports. Only the bare specifier is
     * redirected; `pdf.ts` also imports the worker as a `?url`, which vitest
     * resolves to a string, and pdf.js then falls back to its in-process path —
     * which is what these tests want anyway.
     */
    /*
     * Anchored, and in array form. A plain string alias is a prefix replacement, so
     * `'pdfjs-dist'` also rewrote `pdfjs-dist/build/pdf.worker.min.mjs?url` on the
     * next line of `pdf.ts` into a path inside a file, and the suite stopped
     * resolving at all rather than stopping on `toHex`.
     */
    alias: [
      {
        find: /^pdfjs-dist$/,
        replacement: path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
      },
    ],
  },
});
