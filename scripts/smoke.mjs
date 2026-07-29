/**
 * Browser smoke test.
 *
 * Drives the real app in Chromium against a production build: loads the demo
 * deck, walks the slides, checks that KaTeX, Mermaid and inline SVG actually
 * render, exercises practice and search, then repeats the critical path at phone
 * width. Screenshots land in .tmp/smoke/ for eyeballing.
 *
 * Usage:  node scripts/smoke.mjs [--url http://localhost:3000] [--headed]
 *
 * It needs a Chromium that playwright-core can drive. Set CHROME_PATH to point
 * at one, or rely on the local Playwright browser cache.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const BASE = flag('url', 'http://localhost:3000');
const HEADED = args.includes('--headed');
const OUT = join(process.cwd(), '.tmp', 'smoke');

/**
 * Where Playwright keeps its browsers, per platform.
 *
 * This function used to look only in `~/Library/Caches/ms-playwright` and fall
 * back to `/Applications/Google Chrome.app`, so it worked on exactly one of the
 * three platforms this project gets run on. Windows keeps the cache under
 * LOCALAPPDATA and the binary in `chrome-win\chrome.exe`; Linux -- including every
 * CI runner -- keeps it in `~/.cache/ms-playwright`, which was also missing.
 */
function playwrightCaches() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return [process.env.PLAYWRIGHT_BROWSERS_PATH];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    return [join(local, 'ms-playwright')];
  }
  if (process.platform === 'darwin') {
    return [join(homedir(), 'Library', 'Caches', 'ms-playwright')];
  }
  return [join(homedir(), '.cache', 'ms-playwright')];
}

/** Executable layouts inside a `chromium-<revision>` directory. */
function cachedBinaries(build) {
  if (process.platform === 'win32') {
    return [join(build, 'chrome-win', 'chrome.exe')];
  }
  if (process.platform === 'darwin') {
    return [
      join(build, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
      join(build, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      join(build, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    ];
  }
  return [join(build, 'chrome-linux', 'chrome'), join(build, 'chrome-linux', 'headless_shell')];
}

/** A Chrome or Chromium the operating system already has. */
function systemBinaries() {
  if (process.platform === 'win32') {
    const roots = [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    return roots.map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  // ubuntu-latest ships Chrome at the first of these.
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  for (const cache of playwrightCaches()) {
    if (!existsSync(cache)) continue;
    // Newest revision first, numerically -- a string sort puts 999 above 1181.
    const builds = readdirSync(cache)
      .filter((name) => name.startsWith('chromium-'))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      for (const candidate of cachedBinaries(join(cache, build))) {
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  for (const candidate of systemBinaries()) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `No Chromium found on ${process.platform}. Set CHROME_PATH, or run ` +
      `\`npx playwright install chromium\`.`,
  );
}

const checks = [];
const started = Date.now();
function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  const at = `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(6);
  console.log(`${at} ${passed ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: findChrome(), headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  // ---------------------------------------------------------------- upload screen
  await page.goto(BASE, { waitUntil: 'load' });
  check('upload screen renders', await page.getByRole('heading', { name: /Understand your lecture slides/i }).isVisible());
  check('demo entry point is offered', await page.getByRole('button', { name: /Try the demo lecture/i }).isVisible());
  await page.screenshot({ path: join(OUT, '01-upload.png'), fullPage: true });

  // ------------------------------------------------------------------- workspace
  await page.getByRole('button', { name: /Try the demo lecture/i }).click();
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  check('slide canvas renders', await page.locator('canvas').first().isVisible());

  const canvasBox = await page.locator('canvas').first().boundingBox();
  check('slide canvas has real dimensions', Boolean(canvasBox && canvasBox.width > 300 && canvasBox.height > 150),
    canvasBox ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}` : 'no box');

  check('notes are shown for slide 1', (await page.locator('.prose-study').count()) > 0, `${await page.locator('.prose-study').count()} blocks`);
  check('slide headline is shown', (await page.getByRole('heading', { level: 2 }).count()) > 0);
  check('KaTeX renders maths', (await page.locator('.katex').count()) > 0, `${await page.locator('.katex').count()} spans`);
  await page.waitForSelector('svg.mermaid-svg', { timeout: 30_000 });
  check('Mermaid diagram renders', (await page.locator('svg.mermaid-svg').count()) > 0);
  await page.screenshot({ path: join(OUT, '02-workspace.png'), fullPage: false });

  // Filmstrip thumbnails
  check('filmstrip thumbnails render', (await page.locator('[role="tab"][aria-label^="Slide"] img').count()) > 0);

  // ------------------------------------------------------------ layout controls
  const slideWidth = async () => {
    const box = await page.locator('canvas').first().boundingBox();
    return box ? Math.round(box.width) : 0;
  };
  const splitWidth = await slideWidth();

  check('thumbnails carry their own hide control', await page.getByRole('button', { name: 'Hide thumbnails' }).isVisible());
  await page.getByRole('button', { name: 'Hide thumbnails' }).click();
  await page.waitForTimeout(700);
  const withoutStrip = await slideWidth();
  check('hiding thumbnails widens the slide', withoutStrip > splitWidth, `${splitWidth} → ${withoutStrip}`);
  check('a labelled rail brings thumbnails back', await page.getByRole('button', { name: 'Show thumbnails' }).isVisible());
  await page.getByRole('button', { name: 'Show thumbnails' }).click();
  await page.waitForTimeout(600);

  check(
    'the divider carries a collapse control',
    await page.getByRole('button', { name: 'Hide notes and widen the slide' }).isVisible(),
  );
  await page.getByRole('button', { name: 'Hide notes and widen the slide' }).click();
  await page.waitForTimeout(700);
  const withoutPanel = await slideWidth();
  check('collapsing the panel widens the slide', withoutPanel > splitWidth, `${splitWidth} → ${withoutPanel}`);
  check(
    'the way back is a labelled button that says where it goes',
    await page.getByRole('button', { name: 'Show notes' }).first().isVisible(),
  );
  await page.getByRole('button', { name: 'Show notes' }).first().click();
  await page.waitForTimeout(600);

  /* ---------------------------------------------------------- layout menu */
  // One control for every "make the slide bigger" decision.
  const layoutButton = page.getByRole('button', { name: /^Layout:/ });
  check('a single layout control replaces the old button pile', await layoutButton.isVisible());
  await layoutButton.click();
  await page.waitForTimeout(300);
  check('the menu names the three places the notes can go', (await page.getByRole('menuitemradio').count()) === 3);
  check('only one full screen control exists', (await page.getByRole('menuitemcheckbox', { name: /Full screen/ }).count()) === 1);
  check('the current layout is marked', (await page.getByRole('menuitemradio', { name: /Split/ }).getAttribute('aria-checked')) === 'true');
  await page.screenshot({ path: join(OUT, '02b-layout-menu.png') });

  await page.getByRole('menuitemradio', { name: /Slide only/ }).click();
  await page.waitForTimeout(800);
  const focused = await slideWidth();
  check('slide only gives the slide the window', focused > splitWidth * 1.6, `${splitWidth} → ${focused}`);
  check('and still offers a labelled way back', await page.getByRole('button', { name: 'Show notes' }).first().isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  check('Escape restores the split view', (await slideWidth()) === splitWidth, `back to ${await slideWidth()}`);

  await page.locator('canvas').first().dblclick();
  await page.waitForTimeout(700);
  check('double-clicking the slide hides the notes', (await slideWidth()) > splitWidth);
  await page.keyboard.press('n');
  await page.waitForTimeout(700);
  check('N brings the notes back', (await slideWidth()) === splitWidth);

  // Shift+F is full screen, not "full screen and also toggle the thumbnails".
  const stripBefore = await page.getByRole('button', { name: 'Hide thumbnails' }).count();
  await page.keyboard.press('Shift+F');
  await page.waitForTimeout(600);
  check(
    'Shift+F does not also fire the plain F shortcut',
    (await page.getByRole('button', { name: 'Hide thumbnails' }).count()) === stripBefore,
  );
  // Shift+F really does go full screen, even headless, and only the API can
  // undo it from here — Escape is a browser gesture, not a page event.
  check('Shift+F actually enters full screen', await page.evaluate(() => Boolean(document.fullscreenElement)));
  await page.evaluate(() => document.exitFullscreen().catch(() => undefined));
  await page.waitForTimeout(600);

  // Hiding the notes must give back exactly the layout it took.
  await page.getByRole('button', { name: 'Hide thumbnails' }).click();
  await page.waitForTimeout(600);
  await page.keyboard.press('n');
  await page.waitForTimeout(700);
  await page.keyboard.press('n');
  await page.waitForTimeout(700);
  check(
    'coming back keeps thumbnails hidden if they were hidden',
    await page.getByRole('button', { name: 'Show thumbnails' }).isVisible(),
  );
  await page.getByRole('button', { name: 'Show thumbnails' }).click();
  await page.waitForTimeout(600);

  // Arrow keys inside a tab list move the tab, not the tab *and* the slide.
  const slideLabel = async () => (await page.locator('#stage-page').inputValue()) ?? '';
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await page.waitForTimeout(400);
  const beforeArrow = await slideLabel();
  await page.getByRole('tab', { name: 'Notes', exact: true }).press('ArrowRight');
  await page.waitForTimeout(500);
  check('arrow keys on a tab do not also move the slide', (await slideLabel()) === beforeArrow, `slide ${beforeArrow} → ${await slideLabel()}`);
  check('arrow keys still move between tabs', await page.getByRole('tab', { name: 'Ask', exact: true }).getAttribute('aria-selected') === 'true');
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await page.waitForTimeout(300);

  // Overlay notes: the slide keeps the whole window, the notes float on top.
  await page.getByRole('button', { name: /^Layout:/ }).click();
  await page.getByRole('menuitemradio', { name: /Overlay/ }).click();
  await page.waitForTimeout(900);
  const overlayWidth = await slideWidth();
  check('overlay mode stops the notes from shrinking the slide', overlayWidth > splitWidth * 1.3, `${splitWidth} → ${overlayWidth}`);
  const overlayCard = page.locator('[aria-label="Floating notes"]');
  check('floating notes are present', (await overlayCard.count()) > 0);
  await page.mouse.move(120, 500); // step away from the card
  await page.waitForTimeout(2000); // let the greeting fade
  const idleOpacity = await overlayCard.evaluate((node) => Number(getComputedStyle(node).opacity));
  check('floating notes rest transparent', idleOpacity < 0.5, `opacity ${idleOpacity.toFixed(2)}`);
  await overlayCard.hover();
  await page.waitForTimeout(600);
  const hoverOpacity = await overlayCard.evaluate((node) => Number(getComputedStyle(node).opacity));
  check('hovering wakes the floating notes', hoverOpacity > 0.9, `opacity ${hoverOpacity.toFixed(2)}`);
  check('slide width is unchanged by hovering', (await slideWidth()) === overlayWidth);
  await page.screenshot({ path: join(OUT, '02c-overlay-notes.png') });
  check('floating notes can be pinned', await page.getByRole('button', { name: /Keep the notes visible/ }).isVisible());
  check(
    'the layout control shows the layout you are in',
    (await page.getByRole('button', { name: /^Layout:/ }).getAttribute('aria-label')) === 'Layout: Overlay',
  );
  await page.keyboard.press('l');
  await page.waitForTimeout(400);
  await page.keyboard.press('l');
  await page.waitForTimeout(800);
  check('L cycles back to the split layout', (await slideWidth()) === splitWidth, `${overlayWidth} → ${await slideWidth()}`);

  // Colour: the study surface should not be monochrome.
  const tinted = await page.locator('.tint-card').count();
  check('content cards are colour-coded', tinted > 0, `${tinted} tinted cards`);
  const hues = await page.evaluate(() =>
    new Set(
      [...document.querySelectorAll('.tint-card, .tint-chip')].map((node) => getComputedStyle(node).getPropertyValue('--tint').trim()),
    ).size,
  );
  check('several distinct hues are in play', hues >= 3, `${hues} hues`);

  // --------------------------------------------------------------- slide 3 (SVG)
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  check('keyboard navigation moves slides', (await page.locator('text=Slide 3 of 10').count()) > 0 || (await page.getByText(/Slide 3 of 10/).count()) > 0);
  const figureSvgs = await page.locator('.figure-body svg').count();
  check('inline SVG figure renders', figureSvgs > 0, `${figureSvgs} figures`);
  check('no script survived sanitising', (await page.locator('.figure-body script').count()) === 0);
  await page.screenshot({ path: join(OUT, '03-svg-slide.png') });

  // ------------------------------------------------------------------- practice
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  const firstOption = page.getByRole('radio').first();
  if (await firstOption.count()) {
    await firstOption.click();
    await page.waitForTimeout(400);
    check('quiz answers reveal feedback', (await page.getByText(/Correct|Answer:/).count()) > 0);
  } else {
    check('quiz answers reveal feedback', false, 'no quiz options found');
  }

  // Fill-in-the-blank: a wrong guess earns a hint, and the answer is always
  // one visible tap away.
  const blankInput = page.getByLabel('Your answer').first();
  if (await blankInput.count()) {
    check('the answer can be revealed without guessing', await page.getByRole('button', { name: 'Show answer' }).first().isVisible());
    await blankInput.fill('definitely wrong');
    await blankInput.press('Enter');
    await page.waitForTimeout(400);
    check('a wrong guess earns a hint', (await page.getByText(/Hint: starts with/).count()) > 0);
    await blankInput.fill('nanosecond');
    await blankInput.press('Enter');
    await page.waitForTimeout(400);
    check('typed recall accepts the answer', (await page.getByText(/That is it/).count()) > 0);
  } else {
    check('typed recall accepts the answer', false, 'no blank input found');
  }

  // The next slide's blank is revealed by tapping the blank itself.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const blankButton = page.getByRole('button', { name: 'Show the answer' }).first();
  if (await blankButton.count()) {
    await blankButton.click();
    await page.waitForTimeout(400);
    check('tapping the blank reveals the answer', (await page.getByText(/Answer shown/).count()) > 0);
  } else {
    check('tapping the blank reveals the answer', false, 'no unsolved blank found on slide 2');
  }
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, '04-practice.png'), fullPage: false });

  // --------------------------------------------------------------------- search
  const slideNow = async () => Number((await page.locator('#stage-page').inputValue()) || '0');
  const beforeSearch = await slideNow();
  await page.keyboard.press('/');
  await page.waitForTimeout(300);
  const searchBox = page.getByLabel('Search text');
  check('search opens with /', await searchBox.isVisible());
  await searchBox.fill('trilateration');
  await page.waitForTimeout(1800);
  const hits = await page.getByRole('option').count();
  check('search finds text in the deck', hits > 0, `${hits} slides`);
  check('the first hit is preselected', (await page.getByRole('option').first().getAttribute('aria-selected')) === 'true');
  await page.screenshot({ path: join(OUT, '05-search.png') });

  // Arrowing through results moves the deck, so you can scan without committing.
  await searchBox.press('ArrowDown');
  await page.waitForTimeout(500);
  const previewed = await slideNow();
  check('arrowing a result previews that slide', previewed !== beforeSearch, `slide ${beforeSearch} → ${previewed}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Escape puts the deck back where it was', (await slideNow()) === beforeSearch, `back to ${await slideNow()}`);

  await page.keyboard.press('/');
  await page.getByLabel('Search text').fill('trilateration');
  await page.waitForTimeout(1500);
  await page.getByLabel('Search text').press('Enter');
  await page.waitForTimeout(500);
  check('Enter commits the jump and closes', (await page.getByLabel('Search text').count()) === 0 && (await slideNow()) !== beforeSearch);
  await page.locator('#stage-page').fill(String(beforeSearch));
  await page.locator('#stage-page').press('Enter');
  await page.waitForTimeout(400);

  // -------------------------------------------------------------------- shortcuts
  await page.keyboard.press('?');
  await page.waitForTimeout(300);
  check('shortcuts sheet opens', await page.getByRole('dialog').isVisible());
  await page.keyboard.press('Escape');

  // ----------------------------------------------------------------------- export
  await page.getByRole('button', { name: 'Export notes' }).click();
  await page.waitForTimeout(400);
  check('export sheet previews markdown', (await page.getByText(/slides of notes/).count()) > 0);
  await page.screenshot({ path: join(OUT, '06-export.png') });
  await page.keyboard.press('Escape');

  // -------------------------------------------------------------------- settings
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(400);
  check('settings explains key handling', (await page.getByText(/never logs or stores it/).count()) > 0);
  check('appearance can switch to dark', await page.getByRole('tab', { name: 'Dark' }).isVisible());
  await page.getByRole('tab', { name: 'Dark' }).click();
  await page.waitForTimeout(500);
  check('dark mode applies', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.screenshot({ path: join(OUT, '07-dark.png') });
  await page.getByRole('tab', { name: 'System' }).click();
  await page.keyboard.press('Escape');

  // ------------------------------------------------------------------- chat gate
  await page.getByRole('tab', { name: 'Ask' }).click();
  await page.waitForTimeout(400);
  check('chat explains what is sent', (await page.getByText(/Nothing else from the deck is sent/).count()) > 0);
  check('chat asks for a key before sending', (await page.getByRole('button', { name: /Add your API key to chat/ }).count()) > 0);
  await page.screenshot({ path: join(OUT, '08-chat.png') });

  // -------------------------------------------------------------- review tab gate
  await page.getByRole('tab', { name: 'Review' }).click();
  await page.waitForTimeout(400);
  check('review tab offers to build a set', (await page.getByText(/Review the whole deck/).count()) > 0);

  // ------------------------------------------------------- a real uploaded deck
  await page.getByRole('button', { name: 'Close this deck' }).click();
  await page.waitForTimeout(500);

  // Wrong file type is rejected with an explanation, not a crash.
  await page.setInputFiles('input[type=file]', {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a pdf'),
  });
  await page.waitForTimeout(400);
  check('non-PDF upload is refused clearly', (await page.getByText(/That is not a PDF/).count()) > 0);

  await page.setInputFiles('input[type=file]', join(process.cwd(), 'tests', 'fixtures', 'long-deck.pdf'));
  await page.waitForSelector('canvas', { timeout: 45_000 });
  await page.waitForTimeout(1500);
  check('a real 120-slide deck opens', (await page.getByText(/Slide 1 of 120/).count()) > 0);
  check(
    'unexplained deck invites the next step',
    (await page.getByText(/Start with slide 1/).count()) > 0 || (await page.getByText(/Add your API key/).count()) > 0,
  );
  await page.screenshot({ path: join(OUT, '12-long-deck.png') });

  await page.keyboard.press('/');
  await page.getByLabel('Search text').fill('telegraphy');
  await page.waitForTimeout(6000);
  const deepHit = await page.getByRole('option', { name: /Slide 87/ }).count();
  check('search reaches slide 87 of a long deck', deepHit > 0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Close this deck' }).click();
  await page.waitForTimeout(400);
  check('closing a deck returns to upload', await page.getByRole('heading', { name: /Understand your lecture slides/i }).isVisible());
  check('finished decks are offered for resume', (await page.getByText(/Pick up where you left off/).count()) > 0);

  // ------------------------------------------------- generated content (mocked)
  // The API needs a real key, so the success paths are exercised against mocked
  // responses. Everything downstream — reducer, renderers, practice, progress —
  // is the real thing.
  const keyed = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
  await keyed.addInitScript(() => {
    sessionStorage.setItem('pdfx.gemini-key', 'test-key-not-real');
  });
  const app = await keyed.newPage();
  app.setDefaultTimeout(15_000);
  app.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`keyed: ${message.text()}`);
  });
  app.on('pageerror', (error) => consoleErrors.push(`keyed pageerror: ${error.message}`));

  const note = (slide) => ({
    slide,
    summary: `Least squares, slide ${slide}`,
    blocks: [
      {
        type: 'markdown',
        content:
          'The normal equations follow from setting the gradient to zero:\n\n' +
          '$$A^T A \\hat{x} = A^T b$$\n\n' +
          'In code:\n\n```python\nx_hat = np.linalg.solve(A.T @ A, A.T @ b)\n```',
      },
      { type: 'callout', callout: 'intuition', content: 'You are projecting $b$ onto the column space of $A$.' },
      { type: 'callout', callout: 'memory', content: 'Normal equations: **normal** means perpendicular residual.' },
    ],
    quiz: [
      {
        id: `s${slide}-q0`,
        slide,
        question: 'What does the residual satisfy at the least-squares solution?',
        options: ['It is orthogonal to the column space of $A$', 'It is zero', 'It is parallel to $b$'],
        correctIndex: 0,
        explanation: 'Orthogonality of the residual is exactly what the normal equations encode.',
      },
    ],
    matching: [
      {
        id: `s${slide}-m0`,
        slide,
        title: 'Match each object to its role',
        pairs: [
          { concept: 'A', definition: 'Design matrix of predictors' },
          { concept: 'b', definition: 'Vector of observations' },
          { concept: 'P', definition: 'Projection onto the column space' },
        ],
      },
    ],
    cloze: [
      {
        id: `s${slide}-c0`,
        slide,
        before: 'The projection matrix satisfies $P^2 = P$, which makes it',
        answer: 'idempotent',
        after: '.',
      },
    ],
    worked: {
      problem: 'Solve $\\min \\|Ax - b\\|_2$ for $A = \\begin{bmatrix} 1 \\\\ 1 \\end{bmatrix}$, $b = \\begin{bmatrix} 2 \\\\ 4 \\end{bmatrix}$.',
      steps: ['Form $A^T A = 2$ and $A^T b = 6$.', 'Solve $2x = 6$.'],
      answer: '$x = 3$',
    },
  });

  await app.route('**/api/explain', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        batch: {
          requestedFrom: 1,
          from: 1,
          to: 2,
          totalSlides: 4,
          track: 'quantitative',
          trackNote: 'Quantitative deck: derivations and worked examples.',
          notes: [note(1), note(2)],
          warnings: ['Slide 2: skipped a fill-in-the-blank with no answer.'],
        },
        meta: { model: 'gemini-flash-latest', repaired: true, truncated: false },
      }),
    });
  });

  await app.goto(BASE, { waitUntil: 'load' });
  await app.setInputFiles('input[type=file]', join(process.cwd(), 'tests', 'fixtures', 'dense-math.pdf'));
  await app.waitForSelector('canvas', { timeout: 45_000 });
  await app.waitForTimeout(800);

  await app.getByRole('button', { name: /Explain from here/ }).click();
  await app.waitForTimeout(1200);
  check('generated notes render', (await app.getByRole('heading', { level: 2, name: /Least squares/ }).count()) > 0);
  check('generated maths renders', (await app.locator('.katex').count()) > 0);
  check('generated code block renders', (await app.getByText('np.linalg.solve').count()) > 0);
  check('callouts are labelled', (await app.getByText('Intuition').count()) > 0);
  check('memory hooks stay hidden until revealed', (await app.getByText('Reveal').count()) > 0);
  check('repair warnings are surfaced honestly', (await app.getByText(/Some items were skipped/).count()) > 0);
  check('progress counts the new slides', (await app.getByText('2/4').count()) > 0);
  await app.screenshot({ path: join(OUT, '13-generated-notes.png') });

  const workedButton = app.getByRole('button', { name: /Show the first step/ });
  if (await workedButton.count()) {
    await workedButton.click();
    await app.waitForTimeout(300);
    check('worked example reveals one step at a time', (await app.getByText(/Show step 2/).count()) > 0);
  } else {
    check('worked example reveals one step at a time', false, 'no worked example rendered');
  }

  const matchTerm = app.getByRole('button', { name: /Design matrix of predictors/ });
  await matchTerm.click();
  await app.getByRole('button', { name: /^A$/ }).first().click();
  await app.waitForTimeout(300);
  check('matching accepts a correct pair', (await app.getByText(/1 of 3 matched/).count()) > 0);
  await app.screenshot({ path: join(OUT, '14-generated-practice.png') });

  // Explain failure path
  await app.unroute('**/api/explain');
  await app.route('**/api/explain', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Your Gemini quota is exhausted or rate limited.', code: 'quota', retryable: true }),
    }),
  );
  await app.getByRole('button', { name: /Continue from 3/ }).click();
  await app.waitForTimeout(900);
  check('a failed batch explains itself and offers a retry', (await app.getByText(/Could not generate notes/).count()) > 0);
  check('quota message reaches the reader', (await app.getByText(/quota is exhausted/).count()) > 0);
  await app.screenshot({ path: join(OUT, '15-explain-error.png') });

  // Chat
  await app.route('**/api/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: 'Because the residual must be orthogonal to every column of $A$, which gives $A^T(b - Ax) = 0$.',
        meta: { model: 'gemini-flash-lite-latest' },
      }),
    }),
  );
  await app.getByRole('tab', { name: 'Ask', exact: true }).click();
  await app.waitForTimeout(400);
  await app.getByRole('button', { name: /Why does this matter/ }).click();
  await app.waitForTimeout(900);
  check('tutor reply renders with maths', (await app.getByText(/must be orthogonal to every column/).count()) > 0);
  await app.screenshot({ path: join(OUT, '16-chat.png') });

  // Deck review
  await app.route('**/api/practice', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        set: {
          items: [
            {
              kind: 'quiz',
              id: 'p0',
              slide: 2,
              question: 'Which cost does forming the normal equations explicitly increase?',
              options: ['The condition number squares', 'Nothing changes', 'The residual grows'],
              correctIndex: 0,
              explanation: 'Squaring the matrix squares its condition number.',
            },
            {
              kind: 'match',
              id: 'p1',
              slide: 3,
              title: 'Match the decomposition to its use',
              pairs: [
                { concept: 'QR', definition: 'Stable least squares' },
                { concept: 'SVD', definition: 'Rank-deficient problems' },
              ],
            },
            { kind: 'cloze', id: 'p2', slide: 4, before: 'The spectral radius governs', answer: 'stability', after: '.' },
          ],
          warnings: [],
        },
        meta: { model: 'gemini-flash-latest' },
      }),
    }),
  );
  await app.getByRole('tab', { name: 'Review', exact: true }).click();
  await app.getByRole('button', { name: /Build my review set/ }).click();
  await app.waitForTimeout(1000);
  check('review set renders a mixed deck', (await app.getByText(/0 of 3 done/).count()) > 0);
  check('review items link back to their slide', (await app.getByRole('button', { name: /^Slide 2/ }).count()) > 0);
  await app.getByRole('radio').first().click();
  await app.waitForTimeout(400);
  check('review progress advances as you answer', (await app.getByText(/1 of 3 done/).count()) > 0);
  await app.getByRole('button', { name: /^To do/ }).click();
  await app.waitForTimeout(300);
  check('the "to do" filter hides finished items', (await app.getByText(/Which matrix is idempotent/).count()) === 0);
  await app.screenshot({ path: join(OUT, '17-review.png') });

  await keyed.close();

  // --------------------------------------------------------------------- mobile
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(15_000);
  phone.on('pageerror', (error) => consoleErrors.push(`mobile pageerror: ${error.message}`));
  await phone.goto(BASE, { waitUntil: 'load' });
  await phone.screenshot({ path: join(OUT, '09-mobile-upload.png'), fullPage: true });
  await phone.getByRole('button', { name: /Try the demo lecture/i }).click();
  await phone.waitForSelector('canvas', { timeout: 30_000 });
  await phone.waitForTimeout(1200);
  check(
    'mobile shows a single column with a view switcher',
    await phone.getByRole('tab', { name: 'Slide', exact: true }).isVisible(),
  );
  const noHorizontalScroll = await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('mobile has no horizontal overflow', noHorizontalScroll);
  await phone.screenshot({ path: join(OUT, '10-mobile-slide.png') });
  await phone.getByRole('tab', { name: 'Notes', exact: true }).click();
  await phone.waitForTimeout(1200);
  check('mobile notes render', (await phone.locator('.prose-study').count()) > 0);
  const notesOverflow = await phone.evaluate(() => {
    const nodes = [...document.querySelectorAll('.prose-study, .figure-body, .katex-display')];
    return nodes.some((node) => node.scrollWidth > node.clientWidth + 24 && getComputedStyle(node).overflowX === 'visible');
  });
  check('mobile content does not overflow its container', !notesOverflow);
  await phone.screenshot({ path: join(OUT, '11-mobile-notes.png'), fullPage: false });

  // ---------------------------------------------------------------------- wrap up
  // The 429 is deliberate: the explain-failure case above mocks a quota error.
  const ignorable = /favicon|apple-touch-icon|status of 404|status of 429/i;
  const realErrors = consoleErrors.filter((message) => !ignorable.test(message));
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();

  const failed = checks.filter((entry) => !entry.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshots in ${OUT}`);
  if (failed.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
