/**
 * `@google/genai/web`, not `@google/genai`.
 *
 * The package ships two builds: a Node one that reaches for `node:` modules, and a web one
 * that is pure `fetch`. The bare specifier resolves to the Node build, which cannot be
 * bundled for a Cloudflare Worker — and this module is now imported by both the Express
 * server and the Worker. The web build runs perfectly well on Node 22 (it wants `fetch`,
 * `AbortSignal` and Web Crypto, all of which are there) and is the only one that runs on
 * both, so it is the one to use in both. Nothing here needs the Node-only surface: no file
 * uploads, no tokenizer, just `models.generateContent` with inline data.
 */
import { GoogleGenAI, type Content, type Part } from '@google/genai/web';
import { buildModelChain } from '../shared/models';
import { ApiError, fromModelError, missingKey } from './errors';
import { config } from './config';
import { log } from './log';
import { parseModelJson } from './json';

/**
 * One place that talks to Google. Everything else in the server deals in
 * plain data, which keeps prompts, validation and transport independently
 * testable — and keeps the API key from spreading through the codebase.
 */

export function resolveApiKey(userKey: unknown): string {
  const provided = typeof userKey === 'string' ? userKey.trim() : '';
  if (provided) return provided;
  if (!config.requireUserKey && config.serverApiKey) return config.serverApiKey;
  throw missingKey();
}

/**
 * Accept both raw base64 and data URLs.
 *
 * The prefix is looked for in the first two hundred characters rather than with
 * `includes(',')` over the whole string. A base64 PDF is millions of characters and a data
 * URL's comma is always within the first fifty of them — `data:application/pdf;base64,` —
 * so scanning the rest is a few megabytes of pointless work per request. That matters more
 * than it looks on a platform billed by CPU time.
 */
const DATA_URL_HEAD = 200;

export function pdfPart(base64: string): Part {
  const comma = base64.lastIndexOf(',', DATA_URL_HEAD);
  const data = comma === -1 ? base64 : base64.slice(comma + 1);
  return { inlineData: { data, mimeType: 'application/pdf' } };
}

interface GenerateOptions {
  apiKey: string;
  requestedModel: string | undefined;
  fallbackModel: string;
  systemInstruction: string;
  contents: Content[];
  responseSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Spend the whole output budget on the answer rather than on hidden
   * reasoning. The lite models in particular will happily think until the
   * budget is gone and then return an empty or half-finished object, which is
   * the single biggest cause of "the AI response was not valid JSON".
   */
  disableThinking?: boolean;
  timeoutMs: number;
  signal: AbortSignal;
  scope: string;
}

export interface GenerateResult {
  text: string;
  model: string;
  /** Models that failed before this one succeeded. */
  attempts: string[];
}

function createClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'pdf-explainer' } },
  });
}

/**
 * Not every model accepts every tuning knob: output ceilings differ, and the way
 * you ask for less thinking changed between model generations — the 2.5 family
 * wants `thinkingBudget: 0`, the 3.x family rejects that outright and wants
 * `thinkingLevel`. Rather than maintaining a per-model table that goes stale the
 * week a new alias ships, we walk a short ladder and keep the first rung Google
 * accepts.
 */
export function looksLikeUnsupportedConfig(error: unknown): boolean {
  const status = typeof (error as { status?: number })?.status === 'number' ? (error as { status: number }).status : 0;
  if (status !== 400 && status !== 0) return false;
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    text.includes('invalid_argument') ||
    text.includes('invalid argument') ||
    text.includes('thinking') ||
    text.includes('max_output_tokens') ||
    text.includes('maxoutputtokens') ||
    text.includes('budget')
  );
}

export type Tuning = Record<string, unknown>;

/** Most preferred first. An empty object means "whatever the model defaults to". */
export function tuningLadder(options: Pick<GenerateOptions, 'disableThinking' | 'maxOutputTokens'>): Tuning[] {
  const ceiling = options.maxOutputTokens === undefined ? {} : { maxOutputTokens: options.maxOutputTokens };
  if (!options.disableThinking) return options.maxOutputTokens === undefined ? [{}] : [ceiling, {}];
  return [
    { ...ceiling, thinkingConfig: { thinkingLevel: 'low' } },
    { ...ceiling, thinkingConfig: { thinkingBudget: 0 } },
    ceiling,
    {},
  ];
}

async function callModel(
  client: GoogleGenAI,
  model: string,
  options: GenerateOptions,
  signal: AbortSignal,
  tuning: Tuning,
): Promise<string> {
  const response = await client.models.generateContent({
    model,
    contents: options.contents,
    config: {
      systemInstruction: options.systemInstruction,
      abortSignal: signal,
      ...(options.responseSchema
        ? { responseMimeType: 'application/json', responseSchema: options.responseSchema }
        : {}),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...tuning,
    },
  });
  return response.text ?? '';
}

/**
 * Remember which rung worked, so the ladder is walked once per process rather
 * than once per request. Keyed by model *and* ladder shape: a rung index only
 * means anything within the ladder it came from.
 */
const tuningCache = new Map<string, number>();

function tuningKey(model: string, options: GenerateOptions): string {
  return `${model}|${options.disableThinking ? 'lean' : 'default'}|${options.maxOutputTokens ?? 'auto'}`;
}

/**
 * Try the requested model, then a short ladder of fallbacks. Aborts and quota
 * failures stop immediately — retrying those only wastes the user's time and
 * money.
 */
export async function generateText(options: GenerateOptions): Promise<GenerateResult> {
  const client = createClient(options.apiKey);
  const chain = buildModelChain(options.requestedModel, options.fallbackModel);
  const attempts: string[] = [];
  const ladder = tuningLadder(options);
  let lastError: unknown = null;

  for (const model of chain) {
    if (options.signal.aborted) throw new ApiError(499, 'cancelled', 'Request cancelled.');

    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal = AbortSignal.any([options.signal, timeout]);
    const startedAt = Date.now();

    try {
      const cacheKey = tuningKey(model, options);
      let text = '';
      let rung = tuningCache.get(cacheKey) ?? 0;
      for (;;) {
        try {
          text = await callModel(client, model, options, signal, ladder[rung] ?? {});
          tuningCache.set(cacheKey, rung);
          break;
        } catch (error) {
          const nextRung = rung + 1;
          if (options.signal.aborted || nextRung >= ladder.length || !looksLikeUnsupportedConfig(error)) throw error;
          log.warn(options.scope, `${model} rejected output tuning ${rung}; trying ${nextRung}`);
          rung = nextRung;
        }
      }

      if (!text.trim()) throw new ApiError(502, 'empty_result', 'The model returned an empty response.', true);

      log.info(options.scope, `ok via ${model} in ${Date.now() - startedAt}ms`, { chars: text.length });
      return { text, model, attempts };
    } catch (error) {
      const mapped = error instanceof ApiError ? error : fromModelError(error);
      if (options.signal.aborted) throw new ApiError(499, 'cancelled', 'Request cancelled.');
      if (mapped.code === 'quota' || mapped.code === 'invalid_key' || mapped.code === 'too_large') throw mapped;

      attempts.push(model);
      lastError = mapped;
      log.warn(options.scope, `${model} failed after ${Date.now() - startedAt}ms: ${mapped.message}`);
    }
  }

  throw lastError instanceof ApiError
    ? lastError
    : new ApiError(502, 'server', 'Every model attempt failed. Please try again.', true);
}

export interface JsonResult {
  data: unknown;
  model: string;
  repaired: boolean;
  truncated: boolean;
}

const RETRY_NOTE = `
RETRY NOTE
- Your previous reply could not be parsed as JSON, or arrived empty. Reply with strict JSON only: no prose, no Markdown
  fence, every string properly escaped, every bracket closed.
- Do not start writing until you know you can finish. If you must choose, return fewer items that are complete rather
  than many items that get cut off.`;

/**
 * A JSON call that fails to parse is nearly always a truncated or empty
 * response, and nearly always succeeds on a second, tighter attempt. Retrying
 * here keeps that recovery invisible instead of turning it into an error card
 * the student has to click through.
 */
export async function generateJson(options: GenerateOptions & { retries?: number }): Promise<JsonResult> {
  const retries = Math.max(0, options.retries ?? 1);

  for (let attempt = 0; ; attempt += 1) {
    if (options.signal.aborted) throw new ApiError(499, 'cancelled', 'Request cancelled.');

    const tuned: GenerateOptions =
      attempt === 0
        ? options
        : {
            ...options,
            systemInstruction: `${options.systemInstruction}\n${RETRY_NOTE}`,
            temperature: Math.max(0, (options.temperature ?? 0.4) - 0.2),
          };

    try {
      const result = await generateText(tuned);
      const parsed = parseModelJson(result.text);
      if (!parsed) {
        log.warn(options.scope, `unparseable JSON from ${result.model} (${result.text.length} chars)`);
        throw new ApiError(
          502,
          'unparseable',
          'The AI response was not valid JSON, even after repair. Trying again usually fixes it.',
          true,
        );
      }
      if (parsed.repaired || parsed.truncated) {
        log.info(options.scope, `recovered JSON from ${result.model}`, {
          repaired: parsed.repaired,
          truncated: parsed.truncated,
        });
      }
      return { data: parsed.data, model: result.model, repaired: parsed.repaired, truncated: parsed.truncated };
    } catch (error) {
      const mapped = error instanceof ApiError ? error : fromModelError(error);
      const worthRetrying = mapped.code === 'unparseable' || mapped.code === 'empty_result';
      if (!worthRetrying || attempt >= retries || options.signal.aborted) throw mapped;
      log.warn(options.scope, `retrying after ${mapped.code} (attempt ${attempt + 2} of ${retries + 1})`);
    }
  }
}
