// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The README, checked against the repository.
 *
 * Documentation rots silently, and this project's README is unusually specific —
 * it names files, scripts and counts throughout, which is what makes it worth
 * reading and also what makes it rot. A rename is the common way: the prose stays
 * confident and the path stops existing, and nothing fails.
 *
 * So the checkable part is checked. This does not verify that the README is
 * *true*, only that the things it points at exist and that the scripts it
 * describes are the scripts there are. Everything else — whether a paragraph still
 * describes what the code does — still needs a person, and the fact that this file
 * passes is not evidence about it.
 */

const ROOT = process.cwd();
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/**
 * Fenced blocks are stripped before anything is extracted.
 *
 * The architecture section draws a directory tree inside a fence, and its entries
 * are relative to a parent line (`screens/` under `src/`), so reading them as
 * repository paths produces nothing but false failures.
 */
const PROSE = README.replace(/```[\s\S]*?```/g, '');

const INLINE = [...PROSE.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());

/**
 * Build outputs and assistant scratch are named in the README and are absent from
 * a fresh clone, which is correct rather than a defect. `.env` is a secret nobody
 * should have committed.
 */
const NOT_IN_A_CLEAN_CHECKOUT = /^(dist|build|node_modules|\.tmp|\.wrangler|ai)\b|^\.env$/;

const PATH_LIKE = /^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*\/?$/;
const KNOWN_EXTENSION = /\.(ts|tsx|js|mjs|cjs|json|jsonc|css|html|md|png|svg|pdf)$/;

function looksLikeAPath(token: string): boolean {
  if (token.startsWith('/')) return false; // an API route, not a file
  // A bare extension: the README writes `.pdf` when it means the file type.
  if (/^\.[A-Za-z0-9]+$/.test(token)) return false;
  if (!PATH_LIKE.test(token)) return false;
  if (NOT_IN_A_CLEAN_CHECKOUT.test(token)) return false;
  // A trailing slash means a directory; otherwise insist on a file extension, so
  // that prose like "4/3" and "and/or" is not mistaken for a path.
  return token.endsWith('/') || KNOWN_EXTENSION.test(token);
}

describe('the README describes this repository', () => {
  it('names only files and directories that exist', () => {
    const missing = [...new Set(INLINE.filter(looksLikeAPath))]
      .filter((token) => !existsSync(join(ROOT, token)))
      .sort();
    expect(missing, `README.md points at paths that are not here: ${missing.join(', ')}`).toEqual([]);
  });

  it('names only npm scripts that exist', () => {
    const referenced = [...new Set([...PROSE.matchAll(/`npm (?:run )?([a-z:]+)`/g)].map((match) => match[1]))]
      // `npm install` and `npm test` are npm's own; the rest must be declared.
      .filter((name) => name !== 'install');
    const undeclared = referenced.filter((name) => !(name in PACKAGE.scripts)).sort();
    expect(undeclared, `README.md documents scripts that package.json does not have: ${undeclared.join(', ')}`).toEqual(
      [],
    );
  });

  /**
   * The other direction, which is the one that actually caught something: `clean`,
   * `preview` and `test:watch` existed and were in no table, so nobody reading the
   * README knew `npm run clean` was there — or that it was `rm -rf`, which is not a
   * command on the `cmd.exe` npm runs scripts through on Windows.
   */
  it('documents every script package.json declares', () => {
    const undocumented = Object.keys(PACKAGE.scripts)
      .filter((name) => !new RegExp(`\`npm (run )?${name.replace(':', ':')}\``).test(PROSE))
      .sort();
    expect(undocumented, `package.json has scripts the README never mentions: ${undocumented.join(', ')}`).toEqual([]);
  });

  it('does not promise a command that cannot run on Windows', () => {
    /* npm runs scripts through cmd.exe there, which has no `rm`, no `cp` and no
       `export`. Every sibling of this project is developed on Windows. */
    const unixOnly = Object.entries(PACKAGE.scripts)
      .filter(([, command]) => /(^|\s|&&\s*)(rm|cp|mv|export|touch)\s/.test(command))
      .map(([name]) => name);
    expect(unixOnly, `these scripts use Unix-only commands: ${unixOnly.join(', ')}`).toEqual([]);
  });
});
