import type { RequestHandler, Response, Router } from 'express';
import express from 'express';
import { MODEL_OPTIONS, DEFAULT_CHAT_MODEL, DEFAULT_EXPLAIN_MODEL, DEFAULT_PRACTICE_MODEL } from '../shared/models';
import { normalizeExplainBatch, normalizePracticeSet, shuffleQuizOptions } from '../shared/normalize';
import type { ServerConfig, StudyStyle } from '../shared/types';
import { config } from './config';
import { ApiError } from './errors';
import { generateJson, generateText, pdfPart, resolveApiKey } from './gemini';
import { log, redact } from './log';
import { chatSystemPrompt, explainSystemPrompt, explainUserPrompt, practiceSystemPrompt, practiceUserPrompt } from './prompts';
import { explainSchema, practiceSchema } from './schemas';

/* -------------------------------------------------------------------------- */
/* plumbing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Abort the upstream model call as soon as the browser hangs up.
 *
 * Only the response stream is watched: `req` emits 'close' as soon as its body
 * has been consumed, which would cancel every request the moment it started.
 */
export function requestSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

function sendError(res: Response, scope: string, error: unknown): void {
  const apiError =
    error instanceof ApiError ? error : new ApiError(500, 'server', 'Something went wrong on our side.', true);
  if (!(error instanceof ApiError)) log.error(scope, error);
  if (apiError.code === 'cancelled') {
    log.info(scope, 'cancelled by client');
    if (!res.writableEnded) res.status(499).end();
    return;
  }
  if (res.writableEnded) return;
  res.status(apiError.status).json({
    error: redact(apiError.message),
    code: apiError.code,
    retryable: apiError.retryable,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
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

/** Minimal in-memory guard so a public deployment cannot be trivially hammered. */
function rateLimiter(): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + config.rateLimit.windowMs });
    } else if (entry.count >= config.rateLimit.max) {
      res.status(429).json({
        error: 'Too many requests from this device. Give it a few seconds.',
        code: 'quota',
        retryable: true,
      });
      return;
    } else {
      entry.count += 1;
    }
    if (hits.size > 5000) {
      for (const [ip, value] of hits) if (value.resetAt < now) hits.delete(ip);
    }
    next();
  };
}

/* -------------------------------------------------------------------------- */
/* routes                                                                      */
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

export function createApiRouter(): Router {
  const router = express.Router();
  router.use(rateLimiter());

  router.get('/config', (_req, res) => {
    const payload: ServerConfig = {
      hasServerKey: config.hasServerKey,
      requireUserKey: config.requireUserKey,
      models: MODEL_OPTIONS,
      maxUploadMb: config.maxUploadMb,
    };
    res.json(payload);
  });

  router.post('/explain', async (req, res) => {
    const scope = 'explain';
    try {
      const body = asRecord(req.body);
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
        signal: requestSignal(res),
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

      res.json({ batch, meta: { model: result.model, repaired: result.repaired, truncated: result.truncated } });
    } catch (error) {
      sendError(res, scope, error);
    }
  });

  /**
   * One request covers a slide range, not the whole deck. Asking a lite model
   * for "40 items across 43 slides" reliably produced two: it either ran out of
   * output budget or quietly gave up. A window of a dozen slides is a job it
   * can finish, and the client walks the deck window by window.
   */
  router.post('/practice', async (req, res) => {
    const scope = 'practice';
    try {
      const body = asRecord(req.body);
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
        signal: requestSignal(res),
        scope,
      });

      const set = normalizePracticeSet(result.data, totalSlides);
      set.items = set.items.map((item) => (item.kind === 'quiz' ? { ...shuffleQuizOptions(item), kind: 'quiz' } : item));

      if (set.items.length === 0) {
        throw new ApiError(502, 'empty_result', 'No usable review items came back. Please try again.', true);
      }
      if (result.truncated) set.warnings.unshift('The response was cut short, so the set is smaller than planned.');

      log.info(scope, `slides ${fromSlide}-${toSlide}: ${set.items.length} items`, { warnings: set.warnings.length });
      res.json({
        set,
        meta: {
          model: result.model,
          repaired: result.repaired,
          truncated: result.truncated,
          from: fromSlide,
          to: toSlide,
        },
      });
    } catch (error) {
      sendError(res, scope, error);
    }
  });

  router.post('/chat', async (req, res) => {
    const scope = 'chat';
    try {
      const body = asRecord(req.body);
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
        signal: requestSignal(res),
        scope,
      });

      res.json({ reply: result.text.trim(), meta: { model: result.model } });
    } catch (error) {
      sendError(res, scope, error);
    }
  });

  return router;
}
