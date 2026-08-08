/*
 * Apply the saved appearance before first paint, so a dark-mode reader does not
 * get a white flash on every load.
 *
 * This is a file rather than an inline <script> in index.html because of the
 * Content-Security-Policy. `script-src 'self'` covers a same-origin file and
 * nothing else; an inline block needs its sha256 in the policy, and Vite
 * minifies inline scripts during the HTML build, so that hash would be correct
 * in development and wrong in production — the one place it matters.
 *
 * It lives in public/ so it is copied verbatim rather than bundled, and it is
 * loaded without `defer` so it runs before the body is parsed. That costs one
 * small request against a flash of the wrong theme on every visit.
 *
 * Keep the storage key in step with APPEARANCE_KEY in src/lib/storage.ts.
 */
(function () {
  try {
    var stored = localStorage.getItem('pdfx.appearance');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    /* storage can be blocked; default to light */
  }
})();
