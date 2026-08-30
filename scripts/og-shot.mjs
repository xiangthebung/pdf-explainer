/**
 * Regenerates `public/og.png`, the 1200x630 card that Slack, iMessage and
 * LinkedIn show when somebody pastes a link to this app.
 *
 * The picture is the real app. The bundled demo deck is opened in a real
 * browser, the workspace is left to finish rendering — pdf.js has to paint the
 * slide and Mermaid has to lay out its diagram — and that frame is captured and
 * laid into a titled card. Nothing in it is a drawing of the app, so re-running
 * this after a layout change shows the change instead of quietly going stale.
 *
 * No API key is involved and none is needed: the demo deck ships with the model
 * response already in the repository, so the notes on screen are real notes
 * rendered through the real pipeline without anything reaching Google.
 *
 * Usage:
 *   npm run build && npm run preview   # in one terminal
 *   npm run og                         # in another
 *
 * `--url` points it somewhere else, e.g. the dev server on :3000.
 *
 * One caveat worth knowing before you re-run it: the app uses the platform's own
 * UI typeface, so the card is set in whatever that is on the machine that ran
 * this. The committed PNG was made on Windows.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'public', 'og.png');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const BASE = flag('url', 'http://localhost:4173');

/* The card, as the Open Graph tags in index.html promise it. */
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/** The viewport the workspace is photographed at: a laptop, which is where it lives. */
const SHOT = { width: 1360, height: 850 };

/** The window the photograph sits in. Wide, and cropped by the bottom edge. */
const WINDOW = { width: 1052, height: 658, top: 200, left: 74 };

/** The card around the photograph. Every colour here is one of the app's own. */
function cardHtml(shot) {
  return `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    overflow: hidden;
    position: relative;
    background: #f2f2f5;
    color: #1d1d1f;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto,
      'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* The three study tints, in the order the upload screen names them. */
  .wash { position: absolute; inset: 0;
    background:
      radial-gradient(700px 380px at 12% -12%, rgba(109,40,217,0.16), transparent 70%),
      radial-gradient(620px 340px at 62% -18%, rgba(14,116,144,0.13), transparent 70%),
      radial-gradient(560px 320px at 100% 8%, rgba(180,83,9,0.11), transparent 70%);
  }
  .head { position: relative; padding: 46px 74px 0; }
  .mark { display: flex; align-items: center; gap: 11px; }
  .mark .badge { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
    background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 4px 14px rgba(109,40,217,0.16); }
  .mark .name { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: #1d1d1f; }
  h1 { margin-top: 20px; font-size: 44px; line-height: 1.06; font-weight: 600; letter-spacing: -0.032em; }
  h1 span { background: linear-gradient(96deg, #6d28d9, #0e7490 46%, #b45309);
            -webkit-background-clip: text; background-clip: text; color: transparent; }
  .chips { position: absolute; top: 118px; right: 74px; display: flex; gap: 8px; }
  .chip { display: flex; align-items: center; gap: 6px; border-radius: 999px;
    padding: 8px 14px; font-size: 14px; font-weight: 500; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  .chip i { width: 8px; height: 8px; border-radius: 999px; display: block; }
  /* The photograph, in a window that the bottom edge crops -- it buys scale,
     which is what keeps a three-pane workspace legible at this size. */
  .window {
    position: absolute; top: ${WINDOW.top}px; left: ${WINDOW.left}px;
    width: ${WINDOW.width}px; height: ${WINDOW.height}px;
    border-radius: 14px 14px 0 0; overflow: hidden;
    background: #fff; border: 1px solid rgba(0,0,0,0.09); border-bottom: 0;
    box-shadow: 0 26px 70px rgba(29,29,31,0.20), 0 3px 10px rgba(29,29,31,0.06);
  }
  .titlebar { height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 13px;
    background: #e9e9ed; border-bottom: 1px solid rgba(0,0,0,0.07); }
  .titlebar b { width: 10px; height: 10px; border-radius: 999px; background: rgba(0,0,0,0.14); }
  .titlebar span { margin-left: 10px; font-size: 11px; color: #8e8e97; letter-spacing: 0.01em; }
  .window img { display: block; width: 100%; }
</style>
<div class="wash"></div>
<div class="head">
  <div class="mark">
    <span class="badge">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    </span>
    <span class="name">PDF Explainer</span>
  </div>
  <h1>Understand your <span>lecture slides</span></h1>
</div>
<div class="chips">
  <span class="chip"><i style="background:#6d28d9"></i>Slide-by-slide notes</span>
  <span class="chip"><i style="background:#0e7490"></i>Ask anything</span>
  <span class="chip"><i style="background:#b45309"></i>Active recall</span>
</div>
<div class="window">
  <div class="titlebar"><b></b><b></b><b></b><span>pdf-explainer.xiangli3625.workers.dev</span></div>
  <img src="data:image/png;base64,${shot}" alt="">
</div>
`;
}

async function run() {
  const browser = await chromium.launch({ executablePath: findChrome() });
  const context = await browser.newContext({ viewport: SHOT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByRole('button', { name: /Try the demo lecture/i }).click();

  /*
   * Wait for the things that actually take time, by name rather than by clock.
   * A card caught mid-render is the failure worth engineering against: it is the
   * first thing anybody sees, and a half-drawn one is worse than none.
   */
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForSelector('.prose-study', { timeout: 60_000 });
  await page.waitForSelector('svg.mermaid-svg', { timeout: 60_000 });
  await page.waitForSelector('.katex', { timeout: 60_000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  // The notes panel animates in; nothing here reports when it has settled.
  await page.waitForTimeout(1200);

  const shot = (await page.screenshot({ type: 'png' })).toString('base64');

  /* The demo deck needs no key, so a 404 for the API this build has no server
     for is expected and is not a defect in what was photographed. */
  const ignorable = /favicon|apple-touch-icon|status of 404|\/api\/config/i;
  const real = problems.filter((message) => !ignorable.test(message));
  if (real.length) {
    await browser.close();
    throw new Error(`the app logged errors while being photographed: ${real.join(' | ')}`);
  }

  /*
   * Lay the photograph into the card. Its own context, at a device pixel ratio
   * of 1: the card is 1200x630 *pixels*, not 1200x630 CSS pixels, and a scale
   * factor of 2 here would quietly write a 2400x1260 image under a tag that
   * promises otherwise. The photograph inside it was taken at 2, so it is being
   * scaled down rather than up.
   */
  const cardContext = await browser.newContext({
    viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
    deviceScaleFactor: 1,
  });
  const card = await cardContext.newPage();
  await card.setContent(cardHtml(shot), { waitUntil: 'load' });
  await card.evaluate(() => document.fonts.ready);
  const png = await card.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT },
  });
  writeFileSync(OUTPUT, png);

  await browser.close();
  console.log(`wrote ${OUTPUT} (${CARD_WIDTH}x${CARD_HEIGHT}, ${(png.length / 1024).toFixed(0)} kB)`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
