/**
 * Finding a Chromium to drive.
 *
 * Shared by `scripts/smoke.mjs` and `scripts/og-shot.mjs`. It lived in the smoke
 * suite first and was lifted out when the second script needed it, rather than
 * copied: the whole value of this file is the list of places a browser turns out
 * to be on each of the three platforms this project gets run on, and two copies
 * of that list would be one list and one that is out of date.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

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

export function findChrome() {
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
