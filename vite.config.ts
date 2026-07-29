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
    /*
     * There was a test-only alias here pointing `pdfjs-dist` at its legacy build,
     * to get nine tests past `UnknownErrorException: a.toHex is not a function` on
     * Node 24. It carried a note saying the browser should keep the modern build
     * because "the API it wants is there in every browser this app supports".
     *
     * That was wrong, and the alias was hiding it. `Uint8Array.prototype.toHex`
     * arrived in Chrome 140; a smoke run in Chrome 139 could not open the demo
     * deck at all. `src/lib/pdf.ts` now imports the legacy build outright, for the
     * browser and the worker both, so the tests and the browser agree on which
     * build they are exercising.
     *
     * What still needs redirecting is only the worker's `?url`: in a build that
     * yields a URL the server can serve, and under vitest it yields a
     * root-relative path that Node reads from the filesystem root. Anchored on the
     * whole specifier including the query, and in array form -- a plain string
     * alias is a prefix replacement, which is how an earlier version of this
     * rewrote a path into the middle of a filename.
     */
    alias: [
      {
        find: /^pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs\?url$/,
        replacement: path.resolve(__dirname, 'tests/pdf-worker-url.ts'),
      },
    ],
  },
});
