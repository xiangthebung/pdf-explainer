/**
 * The API, with no web framework in it.
 *
 * Everything here takes a parsed request body and an abort signal and returns a status
 * and a value. That is not architecture for its own sake — it is what makes the same four
 * endpoints run on both things this app is deployed as. There is an Express server for
 * local development and the smoke suite (`server/routes.ts`), and a Cloudflare Worker for
 * production (`worker/index.ts`), and both are now twenty-line adapters over this file.
 *
 * The bug that forced the split is worth recording, because it was invisible from inside
 * the repository. The API was an Express app bundled by esbuild as
 * `--platform=node --format=cjs`, which cannot run on Workers at all — so the Cloudflare
 * deployment was serving `dist/` as static assets and nothing else. Cloudflare's asset
 * handler answers GET and HEAD, so every `POST /api/explain` came back **405 Method Not
 * Allowed**, which the client dutifully reported as "Could not generate notes — Request
 * failed (405)". Nothing was broken in the sense of throwing; the server simply was not
 * there. A build that produces a Node artifact for a platform that does not run Node is
 * the kind of mistake no test in the repository could see, because every test ran the Node
 * artifact.
 */

import {
  MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EXPLAIN_MODEL,
  DEFAULT_PRACTICE_MODEL,
} from '../shared/models';
import { normalizeExplainBatch, normalizePracticeSet, shuffleQuizOptions } from '../shared/normalize';
import type { ServerConfig, StudyStyle } from '../shared/types';
import { config } from './config';
import { ApiError } from './errors';
import { generateJson, generateText, pdfPart, resolveApiKey } from './gemini';
import { log, redact } from './log';
import {
  chatSystemPrompt,
  explainSystemPrompt,
  explainUserPrompt,
  practiceSystemPrompt,
  practiceUserPrompt,
} from './prompts';
import { explainSchema, practiceSchema } from './schemas';

/* -------------------------------------------------------------------------- */
/* shapes                                                                      */
/* -------------------------------------------------------------------------- */

export interface ApiContext {
  /** Aborted when the caller hangs up, so the upstream model call stops too. */
  readonly signal: AbortSignal;
  /** Whatever the platform can tell us about the caller, for the rate limiter. */
  readonly clientId: string;
}

export interface ApiResponse {
  readonly status: number;
  /** `undefined` means an empty body, which only the cancellation path uses. */
  readonly body?: unknown;
  /** Anything beyond `Content-Type`. Only the 405 uses it, for `Allow`. */
  readonly headers?: Readonly<Record<string, string>>;
}

/* -------------------------------------------------------------------------- */
/* plumbing                                                                    */
/* -------------------------------------------------------------------------- */

export function errorResponse(scope: string, error: unknown): ApiResponse {
  const apiError =
    error instanceof ApiError ? error : new ApiError(500, 'server', 'Something went wrong on our side.', true);
  if (!(error instanceof ApiError)) log.error(scope, error);
  if (apiError.code === 'cancelled') {
    log.info(scope, 'cancelled by client');
    return { status: 499 };
  }
  return {
    status: apiError.status,
    body: { error: redact(apiError.message), code: apiError.code, retryable: apiError.retryable },
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readPdf(body: Record<string, unknown>): string {
  const raw = body.pdfBase64 ?? body.pdfData;
  if (typeof raw !== 'string' || raw.length < 64) {
    throw new ApiError(400, 'bad_request', 'No PDF was attached to the request.');
  }
  // base64 inflates by ~4/3; compare against the configured megabyte limit.
  const approximateBytes = (raw.length * 3) / 4;
  if (approximateBytes > config.maxUploadMb * 1024 * 1024) {
    throw new ApiError(413, 'too_large', `That PDF is larger than the ${config.maxUploadMb} MB limit.`);
  }
  return raw;
}

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readStyle(value: unknown): StudyStyle {
  return value === 'deep' || value === 'memorable' || value === 'cram' ? value : 'auto';
}

function readText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function readModel(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Minimal in-memory guard so a public deployment cannot be trivially hammered.
 *
 * Weaker on Workers than in a single Node process, and knowingly so: an isolate holds this
 * map only for as long as it lives and a busy Worker runs many of them, so the effective
 * ceiling is per-isolate rather than global. It still stops the one case it was written
 * for — a single client in a loop — and anything stronger needs a Durable Object, which is
 * a lot of moving parts for an app where every caller is spending their own API quota.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(clientId: string): ApiResponse | null {
  const now = Date.now();
  const entry = hits.get(clientId);
  if (!entry || entry.resetAt < now) {
    hits.set(clientId, { count: 1, resetAt: now + config.rateLimit.windowMs });
  } else if (entry.count >= config.rateLimit.max) {
    return {
      status: 429,
      body: {
        error: 'Too many requests from this device. Give it a few seconds.',
        code: 'quota',
        retryable: true,
      },
    };
  } else {
    entry.count += 1;
  }
  if (hits.size > 5000) {
    for (const [key, value] of hits) if (value.resetAt < now) hits.delete(key);
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* endpoints                                                                   */
/* -------------------------------------------------------------------------- */

const MIN_BATCH = 3;
const MAX_BATCH = 12;
/**
 * Output ceilings. Generous enough for the work, tight enough that a model that
 * starts repeating itself hits the wall in seconds instead of burning a minute
 * of the student's time on 60 KB of the same sentence.
 */
const EXPLAIN_OUTPUT_TOKENS = 16_384;
/** Per-request item ceiling: a whole-deck pass on a low-rate-limit model. */
const MAX_PRACTICE_TARGET = 40;

/** Scale the reply ceiling with the size of the ask. ~600 tokens an item. */
function practiceOutputTokens(targetCount: number): number {
  return Math.min(24_576, 3_072 + targetCount * 640);
}

export function serverConfigResponse(): ApiResponse {
  const payload: ServerConfig = {
    hasServerKey: config.hasServerKey,
    requireUserKey: config.requireUserKey,
    models: MODEL_OPTIONS,
    maxUploadMb: config.maxUploadMb,
  };
  return { status: 200, body: payload };
}

export async function explain(raw: unknown, ctx: ApiContext): Promise<ApiResponse> {
  const scope = 'explain';
  try {
    const body = asRecord(raw);
    const apiKey = resolveApiKey(body.apiKey ?? body.customApiKey);
    const pdf = readPdf(body);
    const totalSlides = readInt(body.totalSlides ?? body.totalPdfPages, 1, 1, 2000);
    const startSlide = readInt(body.startSlide, 1, 1, totalSlides);
    const remaining = totalSlides - startSlide + 1;
    const maxBatch = Math.min(MAX_BATCH, remaining);
    const minBatch = Math.min(MIN_BATCH, maxBatch);

    const result = await generateJson({
      apiKey,
      requestedModel: readModel(body.model ?? body.selectedModel),
      fallbackModel: DEFAULT_EXPLAIN_MODEL,
      systemInstruction: explainSystemPrompt({
        startSlide,
        totalSlides,
        style: readStyle(body.style ?? body.selectedTrack),
        customInstructions: readText(body.customInstructions, 1200),
        minBatch,
        maxBatch,
      }),
      contents: [{ role: 'user', parts: [pdfPart(pdf), { text: explainUserPrompt(startSlide) }] }],
      responseSchema: explainSchema,
      temperature: 0.5,
      maxOutputTokens: EXPLAIN_OUTPUT_TOKENS,
      disableThinking: true,
      retries: 1,
      timeoutMs: config.requestTimeoutMs,
      signal: ctx.signal,
      scope,
    });

    const batch = normalizeExplainBatch(result.data, { requestedFrom: startSlide, totalSlides });
    batch.notes = batch.notes.map((note) => ({
      ...note,
      quiz: note.quiz.map((question) => shuffleQuizOptions(question)),
    }));

    if (batch.notes.length === 0) {
      throw new ApiError(
        502,
        'empty_result',
        'The model did not return anything usable for these slides. Try again, or pick a different model.',
        true,
      );
    }

    if (result.truncated) {
      batch.warnings.unshift('The response was cut short, so this batch covers fewer slides than planned.');
    }

    log.info(scope, `slides ${batch.from}-${batch.to} of ${totalSlides}`, {
      notes: batch.notes.length,
      warnings: batch.warnings.length,
    });

    return {
      status: 200,
      body: { batch, meta: { model: result.model, repaired: result.repaired, truncated: result.truncated } },
    };
  } catch (error) {
    return errorResponse(scope, error);
  }
}

/**
 * One request covers a slide range, not the whole deck. Asking a lite model
 * for "40 items across 43 slides" reliably produced two: it either ran out of
 * output budget or quietly gave up. A window of a dozen slides is a job it
 * can finish, and the client walks the deck window by window.
 */
export async function practice(raw: unknown, ctx: ApiContext): Promise<ApiResponse> {
  const scope = 'practice';
  try {
    const body = asRecord(raw);
    const apiKey = resolveApiKey(body.apiKey ?? body.customApiKey);
    const pdf = readPdf(body);
    const totalSlides = readInt(body.totalSlides, 1, 1, 2000);
    const fromSlide = readInt(body.fromSlide, 1, 1, totalSlides);
    const toSlide = Math.max(fromSlide, readInt(body.toSlide, totalSlides, 1, totalSlides));
    const span = toSlide - fromSlide + 1;
    const targetCount = readInt(body.targetCount, Math.min(MAX_PRACTICE_TARGET, span), 1, MAX_PRACTICE_TARGET);
    const existing = Array.isArray(body.existing)
      ? body.existing.slice(0, 60).map((item) => {
          const entry = asRecord(item);
          return {
            kind: readText(entry.kind, 16) || 'item',
            slide: readInt(entry.slide, 0, 0, totalSlides),
            label: readText(entry.label, 120),
          };
        })
      : [];

    const result = await generateJson({
      apiKey,
      requestedModel: readModel(body.model ?? body.selectedModel),
      fallbackModel: DEFAULT_PRACTICE_MODEL,
      systemInstruction: practiceSystemPrompt({ totalSlides, fromSlide, toSlide, targetCount, existing }),
      contents: [{ role: 'user', parts: [pdfPart(pdf), { text: practiceUserPrompt(fromSlide, toSlide) }] }],
      responseSchema: practiceSchema,
      temperature: 0.35,
      maxOutputTokens: practiceOutputTokens(targetCount),
      disableThinking: true,
      retries: 1,
      timeoutMs: config.requestTimeoutMs,
      signal: ctx.signal,
      scope,
    });

    const set = normalizePracticeSet(result.data, totalSlides);
    set.items = set.items.map((item) => (item.kind === 'quiz' ? { ...shuffleQuizOptions(item), kind: 'quiz' } : item));

    if (set.items.length === 0) {
      throw new ApiError(502, 'empty_result', 'No usable review items came back. Please try again.', true);
    }
    if (result.truncated) set.warnings.unshift('The response was cut short, so the set is smaller than planned.');

    log.info(scope, `slides ${fromSlide}-${toSlide}: ${set.items.length} items`, { warnings: set.warnings.length });
    return {
      status: 200,
      body: {
        set,
        meta: {
          model: result.model,
          repaired: result.repaired,
          truncated: result.truncated,
          from: fromSlide,
          to: toSlide,
        },
      },
    };
  } catch (error) {
    return errorResponse(scope, error);
  }
}

export async function chat(raw: unknown, ctx: ApiContext): Promise<ApiResponse> {
  const scope = 'chat';
  try {
    const body = asRecord(raw);
    const apiKey = resolveApiKey(body.apiKey ?? body.customApiKey);
    const message = readText(body.message, 4000).trim();
    if (!message) throw new ApiError(400, 'bad_request', 'The message was empty.');

    const slide = readInt(body.slide, 1, 1, 2000);
    // Only the current slide's text and notes are sent — never the whole PDF,
    // which keeps every follow-up cheap and limits what leaves the device.
    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-8)
      .map((entry) => {
        const item = asRecord(entry);
        return {
          role: item.role === 'assistant' || item.role === 'model' ? ('model' as const) : ('user' as const),
          text: readText(item.text, 4000),
        };
      })
      .filter((entry) => entry.text.trim().length > 0);
    // A conversation has to open with a user turn.
    while (history.length > 0 && history[0].role === 'model') history.shift();

    const result = await generateText({
      apiKey,
      requestedModel: readModel(body.model ?? body.selectedModel),
      fallbackModel: DEFAULT_CHAT_MODEL,
      systemInstruction: chatSystemPrompt({
        slide,
        slideText: readText(body.slideText, 6000),
        noteText: readText(body.noteText, 6000),
      }),
      contents: [
        ...history.map((entry) => ({ role: entry.role, parts: [{ text: entry.text }] })),
        { role: 'user' as const, parts: [{ text: message }] },
      ],
      temperature: 0.6,
      timeoutMs: config.chatTimeoutMs,
      signal: ctx.signal,
      scope,
    });

    return { status: 200, body: { reply: result.text.trim(), meta: { model: result.model } } };
  } catch (error) {
    return errorResponse(scope, error);
  }
}

/* -------------------------------------------------------------------------- */
/* routing                                                                     */
/* -------------------------------------------------------------------------- */

/** Read-only endpoints, by path under `/api`. */
const GET_ROUTES = { '/config': serverConfigResponse } as const;

/** Everything that takes a body. */
const POST_ROUTES = { '/explain': explain, '/practice': practice, '/chat': chat } as const;

/** Every path this API answers on, for the `Allow` header of a genuine 405. */
export const API_PATHS: readonly string[] = [
  ...Object.keys(GET_ROUTES),
  ...Object.keys(POST_ROUTES),
];

function methodsFor(path: string): string[] {
  const methods: string[] = [];
  if (path in GET_ROUTES) methods.push('GET', 'HEAD');
  if (path in POST_ROUTES) methods.push('POST');
  return methods;
}

/**
 * Dispatch one API call.
 *
 * `path` is the part after `/api`, so `/explain`. `readBody` is a thunk rather than a value
 * because `GET /config` must not wait on a body that is never coming, and because a 404, a
 * 405 or a 429 should be answered without first reading a forty-megabyte upload.
 *
 * The 405 branch is the one to notice. This whole file exists because a `POST` was landing
 * on a static-asset handler that only answers `GET`, and the client was told "Request
 * failed (405)" with nothing to go on. A 405 from here names the path and the methods it
 * takes, and sets `Allow`, so the next person who sees one learns something from it.
 */
export async function dispatch(
  method: string,
  path: string,
  readBody: () => Promise<unknown>,
  ctx: ApiContext,
): Promise<ApiResponse> {
  const verb = method.toUpperCase();
  const route = path.replace(/\/+$/, '') || '/';

  const limited = rateLimit(ctx.clientId);
  if (limited) return limited;

  if (verb === 'GET' || verb === 'HEAD') {
    const handler = GET_ROUTES[route as keyof typeof GET_ROUTES];
    if (handler) return handler();
  }

  if (verb === 'POST') {
    const handler = POST_ROUTES[route as keyof typeof POST_ROUTES];
    if (handler) {
      let body: unknown;
      try {
        body = await readBody();
      } catch {
        return {
          status: 400,
          body: { error: 'The request body was not valid JSON.', code: 'bad_request', retryable: false },
        };
      }
      return handler(body, ctx);
    }
  }

  const allowed = methodsFor(route);
  if (allowed.length > 0) {
    return {
      status: 405,
      headers: { Allow: allowed.join(', ') },
      body: {
        error: `${route} accepts ${allowed.join(', ')}, not ${verb}.`,
        code: 'bad_request',
        retryable: false,
      },
    };
  }
  return { status: 404, body: { error: `No API endpoint at ${route}.`, code: 'bad_request', retryable: false } };
}
