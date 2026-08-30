// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The link preview, checked against the files it points at.
 *
 * Nobody looks at an Open Graph tag. It is rendered by Slack, by iMessage and by
 * LinkedIn, to other people, on a machine that is not yours — so the two ways it
 * breaks are both silent: the image stops existing, and the dimensions stop
 * matching the image. A crawler that follows `og:image` to a 404 shows a card
 * with a grey box in it, and one told 1200x630 about a file that is not draws it
 * letterboxed. Both are worse than having no card at all, because the card is the
 * first thing anybody sees.
 *
 * What this cannot check is whether the sentence is *true* of the app, or whether
 * the picture still looks like it. `npm run og` redraws the picture from the
 * running app; keeping the sentence honest still needs a person.
 */

const ROOT = process.cwd();
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const SITE = 'https://pdf-explainer.xiangli3625.workers.dev';

/**
 * The value of a `<meta>` tag, by either the property or the name attribute.
 *
 * The whole tag is matched first and the content read out of it, rather than
 * both attributes matched in one pattern: long tags are wrapped across lines in
 * this file, so `property` and `content` are often not adjacent.
 */
function meta(key: string): string | null {
  const tag = HTML.match(new RegExp(`<meta[^>]*\\b(?:property|name)="${key}"[^>]*>`, 'i'));
  const content = tag?.[0].match(/content="([^"]*)"/i);
  return content ? content[1] : null;
}

/** Width and height straight out of a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('latin1'), `${file} is not a PNG`).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('the link preview', () => {
  it('says the same thing as the page itself', () => {
    /* One claim about this app, in one place. A second description is a second
       thing to keep true, and it is always the one nobody re-reads. */
    const description = meta('description');
    expect(description).toBeTruthy();
    expect(meta('og:description')).toBe(description);
    expect(meta('twitter:description')).toBe(description);

    const title = HTML.match(/<title>([^<]*)<\/title>/)?.[1];
    expect(title).toBeTruthy();
    expect(meta('og:title')).toBe(title);
    expect(meta('twitter:title')).toBe(title);
  });

  it('carries the tags a crawler needs to draw a large card', () => {
    for (const key of ['og:type', 'og:site_name', 'og:url', 'og:image', 'og:image:alt']) {
      expect(meta(key), `index.html is missing ${key}`).toBeTruthy();
    }
    expect(meta('twitter:card')).toBe('summary_large_image');
    expect(meta('twitter:image')).toBe(meta('og:image'));
  });

  it('points every absolute URL at the deployed origin', () => {
    /* A crawler has no base to resolve a relative path against, so these have to
       be absolute — and absolute at the right host, which is the mistake a copied
       block makes. */
    const canonical = HTML.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1];
    expect(canonical).toBe(`${SITE}/`);
    expect(meta('og:url')).toBe(`${SITE}/`);
    for (const key of ['og:image', 'twitter:image']) {
      expect(meta(key)!.startsWith(`${SITE}/`), `${key} points somewhere else`).toBe(true);
    }
  });

  it('names an image that is really there, at the size it claims', () => {
    const path = meta('og:image')!.slice(`${SITE}/`.length);
    const file = join(ROOT, 'public', path);
    expect(existsSync(file), `og:image names ${path}, which is not in public/`).toBe(true);

    const { width, height } = pngSize(file);
    expect(String(width)).toBe(meta('og:image:width'));
    expect(String(height)).toBe(meta('og:image:height'));
    /* The ratio every consumer crops to. Off it, the card is letterboxed. */
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
  });
});
