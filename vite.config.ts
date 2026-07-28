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
  },
});
