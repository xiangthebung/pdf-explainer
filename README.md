# PDF Explainer

Turn a lecture slide deck into a study workspace: slides on one side, explanations
written for you on the other, a tutor that knows which slide you are looking at,
and practice that makes you retrieve rather than re-read.

Everything runs against your own Gemini API key. Slides are held in memory for the
length of a request and never written to the server.

```bash
npm install
cp .env.example .env      # optional; the app also works with a key pasted in the UI
npm run dev               # http://localhost:3000
```

Open the app, drop in a PDF (or press **Try the demo lecture** to see the whole
flow with no key at all), then add a key in **Settings** when you want notes
generated.

## How it fits together

```
src/            browser app
  screens/      upload flow
  workspace/    slide stage, filmstrip, notes / ask / review panels, search
  practice/     quiz, matching, fill-in-the-blank, worked examples
  components/   design-system primitives and the Markdown/LaTeX/diagram renderers
  state/        reducer + contexts (study session, preferences)
  lib/          API client, pdf.js engine, storage, sanitisers, export
shared/         types, model catalogue, normaliser, Markdown pipeline (client + server)
server/         Express API: prompts, response schemas, JSON repair, Gemini client
tests/          vitest suites plus generated fixture decks
```

Three API routes, all cancellable and all validated on the way in and out:

| Route | Does |
| --- | --- |
| `GET /api/config` | What the client needs to know: is a key required, which models, upload ceiling |
| `POST /api/explain` | One batch of slide notes, sized by content density |
| `POST /api/practice` | Review items for one slide range: quizzes, matching pairs, blanks |
| `POST /api/chat` | One tutor answer for the current slide |

## Design decisions worth knowing

**Notes arrive in batches.** The model decides how many slides to cover (3–12)
based on density, so reading starts in seconds instead of after a five-minute
whole-deck run. The panel always offers the one action that makes sense next:
explain from here, or continue from the first gap.

**Review sets are planned around the model's rate limit.** One "cover all 43
slides" request used to come back with two questions, or with JSON cut off
mid-object. Now `shared/practicePlan.ts` picks the shape of the run from the
model: Flash Lite has room for several requests, so it walks the deck in windows
of about ten slides and items appear while the rest is still being written; Flash
gets five requests a minute, so it covers the whole deck in one bigger pass
rather than being rate-limited half way through. Either way requests are paced to
the model rather than to the network, and a 429 gets one patient retry before the
run stops and says so. Measured on the same 42-slide deck: 45 items in five passes
on Flash Lite, 29 items in one pass on Flash.

The schema helps too: `quizzes`, `matchings` and `blanks` are separate arrays,
because one flat "any item" shape invites a small model to fill fields that do
not belong to the item it is writing — and then repeat itself until it hits the
token ceiling.

**"Add more questions" tells the model what it already asked.** The second pass
sends the existing items back as context so it fills gaps instead of rewording
itself. Only that pass: on a first run the same list measurably shrinks the batch
without reducing repeats, so it is not sent. Identical items are collapsed on
arrival by text, and that is as far as the de-duplication goes — a question you
meet again in the review set is revision, not a bug.

**Model output is treated as hostile.** `shared/normalize.ts` repairs what it can
and drops what it cannot trust, reporting every repair as a warning the UI shows.
It never invents subject matter: a dropped question beats a wrong one.
`server/json.ts` recovers from unescaped LaTeX (`"\frac"` is *valid* JSON and
means form-feed, which would silently corrupt the maths), trailing commas, and
responses cut off by the token ceiling — a truncated batch still yields the slides
that completed.

**LaTeX and Markdown are repaired before rendering.** `shared/markdown.ts` lifts
code fences, inline code and maths spans out of harm's way, then normalises
`\[ … \]`, collapses JSON-escaped commands, escapes currency that is not maths,
and wraps stray macros. KaTeX runs with `throwOnError: false`, and every block is
inside an error boundary, so one bad formula cannot take down the page.

**Diagrams are sanitised, not trusted.** Mermaid loads on demand, runs with
`securityLevel: 'strict'` and HTML labels off, and its SVG output goes through the
same allowlist sanitiser as model-authored SVG: no scripts, no event handlers, no
`foreignObject`, no external references. Figures are made responsive so they scale
with the panel instead of overflowing it.

**The PDF lifecycle is explicit.** The pdf.js worker ships with the bundle (no
CDN), documents are destroyed on unmount and on deck change, render tasks are
cancelled before the next one starts, and thumbnails rasterise only near the
viewport so a 300-slide deck opens as fast as a 10-slide one.

**Your key, your device.** It lives in `sessionStorage` by default and only moves
to `localStorage` if you tick *Remember on this device*. It is sent with each
request, forwarded to Google, and never logged: `server/log.ts` redacts key-shaped
strings from every log line and error message. Chat sends the current slide's text
and notes — not the whole deck.

**Sessions survive a refresh.** Deck, notes, answers and conversations are stored
in IndexedDB, and the upload screen offers to pick up where you left off. Notes
export as one portable Markdown file with the maths, code and diagrams intact.

## Keyboard

`←` `→` `J` `K` `Space` slides · `Home` `End` ends · `1` `2` `3` study tabs · `E`
explain from here · `R` reset this slide's practice · `/` search · `L` layout ·
`N` (or double-click) notes on or off · `F` thumbnails · `⇧F` full screen ·
`+` `−` `0` zoom · `?` all shortcuts · `Esc` step back or close.

Arrow keys belong to whatever has focus: inside the tab bar, the thumbnail strip
or on the divider they move that control, not the slide as well.

## Layout

There is one control for every "make the slide bigger" decision, in the slide
toolbar, and it names what it does:

| Layout | The slide gets | The notes |
| --- | --- | --- |
| Split | Its half of the window | Beside the slide, resizable |
| Overlay | The whole window | Floating on top, translucent until you reach for them — pin to keep them awake |
| Slide only | The whole window | Hidden, with a labelled way back |

Full screen is a separate line in the same menu, because it is a separate
question: it hides the browser, and it composes with any of the three layouts.
Leaving "slide only" puts back the layout you had — including whether the
thumbnails were showing — rather than a default, and every choice is remembered
for next time.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Express + Vite in middleware mode on `:3000` |
| `npm run build` | Client bundle into `dist/`, server bundled to `dist/server.cjs` |
| `npm start` | Serve the production build (`NODE_ENV=production`) |
| `npm run lint` | `tsc --noEmit` (strict) |
| `npm test` | Vitest: normaliser, JSON recovery, LaTeX pipeline, sanitiser, reducer, export, PDF engine, cancellation |
| `npm run fixtures` | Regenerate the fixture decks in `tests/fixtures/` |

`node scripts/smoke.mjs --url http://localhost:3000` drives a real browser through
the demo deck — rendering, practice, search, export, dark mode and the phone
layout — and writes screenshots to `.tmp/smoke/`. It needs a Chromium; set
`CHROME_PATH` if it cannot find one.

## What the fixtures cover

`tests/fixtures/` holds decks built by `scripts/build_fixtures.cjs`: ordinary
bullet slides, formula-heavy slides with escaped LaTeX, code listings and a
vector figure, a 120-slide deck for the filmstrip and search, and a deck with no
text layer at all. The demo deck in `src/demo/demoDeck.ts` is stored as raw model
output and normalised at load, so it exercises the same pipeline as a live
response — LaTeX, Mermaid, inline SVG, tables and all. Its PDF can be rebuilt with
`node scripts/generate_gps_slides.cjs`.
