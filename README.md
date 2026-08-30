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
  state/        reducer + contexts (study session, preferences, model catalogue)
  lib/          API client, pdf.js engine, storage, sanitisers, export
shared/         types, model ranking, normaliser, Markdown pipeline (client + server)
server/         the API: prompts, response schemas, JSON repair, Gemini client
  api.ts        every endpoint, with no web framework in it
  headers.ts    the CSP and friends, shared by both targets
  routes.ts     Express adapter — local development and the smoke suite
  index.ts      the Node entry point
worker/         Cloudflare Worker adapter — production
tests/          vitest suites plus generated fixture decks
```

The API takes a parsed body and an abort signal and returns a status and a value,
which is what lets the same endpoints run on both things this deploys as. See
**Deployment** below for why that matters more than it sounds — twice.

Five API routes. The four that call a model are cancellable and validated on
the way in and out; `GET /api/config` is neither, because it takes no input and
returns three settings:

| Route | Does |
| --- | --- |
| `GET /api/config` | What the client needs to know: is a key required, upload ceiling |
| `POST /api/models` | Which models *this key* can call. Separate, and a POST, so the key never lands in a cacheable URL |
| `POST /api/explain` | One batch of slide notes, sized by content density |
| `POST /api/practice` | Review items for one slide range: quizzes, matching pairs, blanks |
| `POST /api/chat` | One tutor answer for the current slide |

## Design decisions worth knowing

**Notes arrive in batches.** The model decides how many slides to cover (3–12)
based on density, so reading starts in seconds instead of after a five-minute
whole-deck run. The panel always offers the one action that makes sense next:
explain from here, or continue from the first gap.

**There is no model catalogue.** There was one — five hardcoded ids — and a list
of model names goes stale the week a new one ships, while also offering people
models their own key cannot call. `POST /api/models` asks Google what this key
can actually use, and `shared/models.ts` ranks the answer.

Which means everything there reasons about ids it has never seen, and two rules
fall out of that. `generateContent` support is necessary and nowhere near
sufficient — Gemini's text-to-speech and image-generation models support it too,
and will cheerfully be asked for JSON study notes — so `looksTextCapable` filters
them out by name, because the name is all the list gives us. And ids are matched
by whole segment rather than by substring: scoring `pro` with `/pro/` once let
`gemini-2.5-pro-preview-tts` tie with `gemini-2.5-pro` and win the tiebreak,
making a speech model the default for slide notes.

A retired id sitting in someone's `localStorage` needs no migration table. It is
simply not in the catalogue, so it is not chosen.

**Slide notes default to Flash, not Pro,** and that is not a typo. "The heavy
lifting deserves the strongest model" is the obvious rule, and against a real
key it picks `gemini-pro-latest` and the first batch comes straight back **429**:
Pro allows around two requests a minute on a free key, and notes arrive in
batches by design, so the flow that makes this app pleasant is exactly the one
Pro's limit forbids. Every caller brings their own free key. A model that cannot
finish is not the better model — so every Flash model outranks Pro, which sits one
click away in the picker, and `modelRequestsPerMinute` paces it at two a minute
if you do pick it.

Thirty-three models came back from that key. Nineteen of them can do this job.
The rest were Lyria (music), Nano Banana (images), Robotics-ER, Computer Use,
Antigravity, Deep Research, Omni and Gemma — every one of which answers
`generateContent`, and one of which, `nano-banana-pro-preview`, was being
offered as a fast text model because `nano` reads as a compact variant. The real
list is pinned in `tests/models.test.ts`, because that is the part no amount of
care invents.

**Review sets are planned around the model's rate limit.** One "cover all 43
slides" request used to come back with two questions, or with JSON cut off
mid-object. Now `shared/practicePlan.ts` picks the shape of the run from the
model: a compact model has room for several requests, so it walks the deck in
windows of about ten slides and items appear while the rest is still being
written; a full-size one gets around five requests a minute, so it covers the
whole deck in one bigger pass rather than being rate-limited half way through.
Either way requests are paced to the model rather than to the network, and a 429
gets one patient retry before the run stops and says so. Measured on the same
42-slide deck: 45 items in five passes on a lite model, 29 items in one pass on a
full one.

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
and drops what it cannot trust, reporting repairs as warnings the UI shows —
deduplicated, and capped at twelve so one badly-formed batch cannot bury the
notes under its own complaints.
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

Where that markup gets *parsed* matters as much as what survives the parse. The
XML path is a `DOMParser`, which is inert. The forgiving fallback for malformed
XML — one unclosed tag is enough to reach it — used to parse into a
`document.createElement('div')`, and an element made that way belongs to the live
document: a browser starts fetching `<img src>` in a document-owned subtree
whether or not it is attached, so `onerror` fires before the sanitiser has looked
at a single attribute. It parses into `document.implementation.createHTMLDocument`
now, which has no browsing context and cannot load anything.

**A CSP, so that a gap in any of the above is worth nothing.** `server/headers.ts`
is one policy for both deploy targets: `'self'` throughout, no inline or evaluated
script, `frame-ancestors 'none'`. The exceptions are named where they are set. It
is production-only, because Vite's dev server injects its HMR client inline.

The pre-paint theme switch is `public/theme.js` rather than an inline block for
exactly this reason. Hashing an inline script does not work here — Vite minifies
inline scripts when it builds the HTML, so the hash would be right in development
and wrong in production, which is the one place it matters.

**The PDF lifecycle is explicit.** The pdf.js worker ships with the bundle (no
CDN), documents are destroyed on unmount and on deck change, render tasks are
cancelled before the next one starts, and thumbnails rasterise only near the
viewport so a 300-slide deck opens as fast as a 10-slide one.

**A file that will not open says which way it failed.** pdf.js raises the same
`InvalidPDFException` for a damaged deck, an empty file and a PNG someone renamed
to `.pdf`, and all three used to be reported as "It may be corrupted" — vague for
two of them and wrong for the third, because it sends someone who picked the wrong
file off to re-export the right one. `src/lib/pdf.ts` looks for the `%PDF-` header
first and names the case: not a PDF, empty, password protected, no pages, or
corrupt. The header is searched for in the first kilobyte rather than at offset
zero, matching pdf.js's own tolerance, because a stricter check would reject files
that would otherwise have opened.

**A slide with no text layer says so.** A scanned deck renders normally and
extracts nothing, which quietly makes search useless and gives the tutor only a
picture to work from. The app knew this and told nobody. There is a marker on the
slide now, and the extracted text sits in a visually-hidden node beside the canvas
so that a screen reader gets the content of the slide rather than only its number.
Notes and practice still work on a scanned deck — Gemini reads the page image —
so this is a note about what is degraded, not a refusal.

**Your key, your device.** It lives in `sessionStorage` by default and only moves
to `localStorage` if you tick *Remember on this device*. It is sent with each
request, forwarded to Google, and never logged: `server/log.ts` redacts key-shaped
strings from every log line and error message. Chat sends the current slide's text
and notes — not the whole deck.

That redaction is a list of patterns, and a list of patterns quietly stops being
true when a provider changes format. It knew `AIza…` and not `AQ.Ab8…`, which is
what AI Studio mints today — and Google echoes the rejected key back inside some
of its own "API key not valid" messages, which is precisely the string that
reaches `log.warn`. Both formats are pinned in `tests/log.test.ts` now.

**Sessions survive a refresh.** Deck, notes, answers and conversations are stored
in IndexedDB, and the upload screen offers to pick up where you left off. Notes
export as one portable Markdown file with the maths, code and diagrams intact.

## Keyboard

`←` `→` `J` `K` `Space` `PgUp` `PgDn` slides · `Home` `End` ends · `1` `2` `3`
study tabs · `E` explain from here · `R` reset this slide's practice · `/` search ·
`L` layout · `N` (or double-click) notes on or off · `F` thumbnails · `⇧F` full
screen · `+` (or `=`) `−` `0` zoom · `?` all shortcuts · `Esc` step back or close.

Arrow keys belong to whatever has focus: inside the tab bar, the thumbnail strip,
on the divider, or in a scrolling panel, they move that thing and not the slide as
well.

## Layout

There is one control for every "make the slide bigger" decision, in the slide
toolbar, and it names what it does:

| Layout | The slide gets | The notes |
| --- | --- | --- |
| Split | Its half of the window | Beside the slide, resizable |
| Overlay | The whole window | A window on top: drag it anywhere, resize from any edge, translucent until you reach for them — pin to keep them awake |
| Slide only | The whole window | Hidden, with a labelled way back |

**The docked panel** is a column with one degree of freedom. Drag the divider, or focus
it and use the arrow keys (`src/hooks/usePanelResize.ts`).

**The floating notes** are a window (`src/hooks/useFloatingPanel.ts`). Drag the header
to move them, drag any of eight edges and corners to resize, or from the header use the
arrow keys to move and Shift with the arrows to resize — one tab stop that does
everything the handles do, which is why the handles themselves are hidden from assistive
tech instead of adding nine. The rect is clamped to the slide stage, committed to
preferences on release rather than per frame, and there is a reset button in the header
once you have moved it.

They do not share a size, and that is the second time this has been reconsidered. The
overlay began as a pinned card that could only get wider, so sharing the docked width was
right; once it could be moved it became a window with four degrees of freedom and a column
width was no longer the same kind of quantity. `overlayRect` is its own preference, `null`
until you place it by hand — which is what lets the default still be computed from the
stage rather than guessed.

Full screen is a separate line in the same menu, because it is a separate
question: it hides the browser, and it composes with any of the three layouts.
Leaving "slide only" puts back the layout you had — including whether the
thumbnails were showing — rather than a default, and every choice is remembered
for next time.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Express + Vite in middleware mode on `:3000` |
| `npm run build` | Client bundle into `dist/`, Node server bundled to `build/server.cjs` |
| `npm start` | Serve the built client and API with Node, in production mode |
| `npm run deploy` | Build, then `wrangler deploy` to Cloudflare |
| `npm run worker:dev` | The Worker locally, on `workerd`, with the real assets binding |
| `npm run lint` | `tsc --noEmit` (strict) |
| `npm test` | Vitest: normaliser, JSON recovery, LaTeX pipeline, sanitiser, reducer, export, PDF engine, cancellation, API routing, model ranking, key redaction, security headers, the Express adapter over HTTP, deploy shape, documentation, the link preview |
| `npm run test:watch` | The same suite, watching |
| `npm run fixtures` | Regenerate the fixture decks in `tests/fixtures/` |
| `npm run preview` | Vite's own static preview of `dist/`, with no API behind it |
| `npm run clean` | Delete `dist/` and `build/` |
| `npm run smoke` | Drive a real browser through the demo deck (see below) |
| `npm run og` | Redraw `public/og.png`, the link-preview card, from the running app |

The Node bundle goes to `build/`, not `dist/`, because `dist/` is uploaded to
Cloudflare wholesale — a server bundle in there would be published to the public
alongside the client, sourcemap and all.

`npm start` passes `--production` rather than setting `NODE_ENV`, and that is not
decoration. Nothing in the repository set `NODE_ENV`, so the command documented as
serving the production build did not: `config.isProduction` was false, which put a
Vite dev server in front of `dist/` and turned off the CSP. An inline
`NODE_ENV=production` in the script would fix it on a Unix shell and be a syntax
error in the `cmd.exe` npm uses on Windows, so the switch is read by the program
instead. `NODE_ENV` still wins where it is already set.

`node scripts/smoke.mjs --url http://localhost:3000` drives a real browser through
the demo deck — rendering, practice, search, export, dark mode and the phone
layout — and writes screenshots to `.tmp/smoke/`. It needs a Chromium; set
`CHROME_PATH` if it cannot find one. Finding that Chromium is `scripts/chrome.mjs`,
shared with the card script below rather than copied into it: the value of that
file is a list of where a browser turns out to live on three platforms, and two
copies of such a list are one list and one that is out of date.

## The link preview

`index.html` carries Open Graph and Twitter card tags, so pasting a link to this
app into a chat shows a title, a sentence and a picture rather than a bare URL.
The sentence is the same one as the meta description: one claim about the app, in
one place, so there is only one thing to keep true, and `tests/socialCard.test.ts`
fails if the two ever drift apart, if the image named is not there, or if it is
not the 1200×630 every consumer crops to.

The picture is `public/og.png`, and it is a photograph rather than a drawing.
`npm run og` opens the bundled demo deck in a real browser, waits until pdf.js has
painted the slide and Mermaid has laid out its diagram, and lays that frame into
the titled card. No API key is involved: the demo deck ships with the model
response in the repository, so the notes in the picture are real notes through the
real pipeline with nothing reaching Google. It needs the app running:

```bash
npm run build && npm run preview
npm run og
```

Re-run it after a layout change. A card that no longer looks like the app is worse
than no card, because it is the first thing anybody sees.

## Deployment

Cloudflare Workers. `npm run deploy`.

Live at [pdf-explainer.xiangli3625.workers.dev](https://pdf-explainer.xiangli3625.workers.dev/).

`wrangler.jsonc` binds `dist/` as static assets and gives `/api/*` to the Worker via
`run_worker_first`; everything else falls back to `index.html`, because the client
owns its own routes. No secrets are needed — with no `GEMINI_API_KEY` bound, every
caller brings their own key, which is the mode this runs in. `wrangler secret put
GEMINI_API_KEY` switches it to a shared key.

**Why there are two entry points.** This app was moved to Workers with only its
client, because `npm run build` produced a CommonJS Node bundle of an Express server
and Workers cannot run one. So the deploy was `dist/` as static assets — and
Cloudflare's asset handler answers `GET` and `HEAD`, so every `POST /api/explain`
came back **405 Method Not Allowed** and the app reported "Could not generate notes —
Request failed (405)". Nothing threw. The server was not there.

Every test passed throughout, because every test ran the Node artifact. So
`tests/deployTarget.test.ts` now asserts the *shape* of the deploy rather than any
behaviour: there is a Worker, it is the entry point, every API path reaches it before
the asset handler, and the server bundle is not a public asset. A build that produces
an artifact for a platform that does not run it is not the kind of mistake a unit test
can see.

**And then it happened again, backwards.** The commit that fixed the 405 split one
Express app into a shared `dispatch` plus two adapters. It tested `dispatch`
thoroughly and the Worker by its shape, and left the Express adapter as the only
piece with nothing driving it — where it had been written as
`router.all('/{*path}')`, which is Express 5 path syntax on an Express 4
dependency. The pattern matched no request at all.

So every `/api` call on Node fell past the router to the single-page-app
catch-all and came back as `index.html` with a 200 on it. `GET /api/config`
returned a web page, and the client treats its config request as silent
best-effort, so it swallowed that and used its defaults: the app looked completely
normal with no API behind it. Production was unaffected — Cloudflare never runs
this file — so `npm run dev` and `npm start` were the only casualties, for four
commits. The smoke suite passed 88/88 throughout, because it stubs the endpoints
it cares about, and the one endpoint it did not stub was the one telling the truth.

`tests/expressRoutes.test.ts` drives the real router over a real socket now. It is
eight cases and it would have caught this on the day. The router takes no path
pattern at all any more, because there was nothing wrong with the code except the
syntax of a string neither TypeScript nor Express would complain about.

One thing to watch: the Gemini call is I/O, and waiting on `fetch` costs no CPU, so a
ninety-second generation is nearly free. Parsing the request is not — a base64 PDF
arrives inside a JSON body. `MAX_UPLOAD_MB` is the lever if large decks start failing
where small ones succeed.

## What the fixtures cover

`tests/fixtures/` holds decks built by `scripts/build_fixtures.cjs`: ordinary
bullet slides, formula-heavy slides with escaped LaTeX, code listings and a
vector figure, a 120-slide deck for the filmstrip and search, and a deck with no
text layer at all. The demo deck in `src/demo/demoDeck.ts` is stored as raw model
output and normalised at load, so it exercises the same pipeline as a live
response — LaTeX, Mermaid, inline SVG, tables and all. Its PDF can be rebuilt with
`node scripts/generate_gps_slides.cjs`.
