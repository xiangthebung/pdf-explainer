/**
 * `@google/genai/web`, not `@google/genai`.
 *
 * The package ships two builds: a Node one that reaches for `node:` modules, and a web one
 * that is pure `fetch`. The bare specifier resolves to the Node build, which cannot be
 * bundled for a Cloudflare Worker — and this module is imported by both the Express server
 * and the Worker. The web build runs perfectly well on Node 22 (it wants `fetch`,
 * `AbortSignal` and Web Crypto, all of which are there) and is the only one that runs on
 * both, so it is the one to use in both. Nothing here needs the Node-only surface: no file
 * uploads, no tokenizer, just `models.generateContent` with inline data.
 */
import { GoogleGenAI, type Content, type Part } from '@google/genai/web';
import {
  buildModelChain,
  chooseDefaultModel,
  looksTextCapable,
  modelRequestsPerMinute,
  resolveModelId,
  type ModelPurpose,
} from '../shared/models';
import type { ModelOption } from '../shared/types';
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
 * so scanning the rest is a few megabytes of pointless work per request. That matters
 * more than it looks on a platform billed by CPU time.
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
  /** Optional compatibility value; an empty value is resolved dynamically. */
  fallbackModel?: string;
  purpose: ModelPurpose;
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

interface ListedModel {
  name?: string;
  displayName?: string;
  description?: string;
  /** Current SDK field. */
  supportedActions?: string[];
  /** Older API response field retained for compatibility with provider responses. */
  supportedGenerationMethods?: string[];
}

const MODEL_CACHE_TTL_MS = 5 * 60_000;
const MODEL_CACHE_LIMIT = 8;
const modelCache = new Map<string, { expiresAt: number; models: ModelOption[] }>();

/**
 * Key the cache by a digest rather than by the key itself.
 *
 * The map is in memory and is never logged, so this is not defending against
 * much — but a long-lived process holding a handful of users' plaintext API keys
 * as map keys is the sort of thing that becomes a real problem the first time
 * something dumps a heap. A digest costs one `await` on a path that is already
 * asynchronous.
 */
async function cacheKeyFor(apiKey: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(apiKey);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest).slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // No Web Crypto: cache nothing rather than cache under a plaintext key.
    return '';
  }
}

function modelId(name: unknown): string {
  if (typeof name !== 'string') return '';
  const raw = name.trim();
  const id = raw.startsWith('models/') ? raw.slice('models/'.length) : raw;
  // Keep resource/tuned names usable while rejecting values that cannot be a model id.
  return /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,159}$/.test(id) ? id : '';
}

function supportsGeneration(model: ListedModel): boolean {
  const actions = model.supportedActions ?? model.supportedGenerationMethods;
  /* Fail open only on missing metadata, and only because the alternative is an
     app with no models at all the day a field is renamed. `looksTextCapable`
     below is the filter that does the real work, and it reads the id, which is
     always there. */
  if (!actions || actions.length === 0) return true;
  return actions.some((action) => action.toLowerCase().replace(/[^a-z]/g, '') === 'generatecontent');
}

function shortDescription(value: string | undefined): string {
  const compact = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!compact) return '';
  const sentence = compact.split(/[.!?](?:\s|$)/)[0]?.trim() || compact;
  return sentence.length > 110 ? `${sentence.slice(0, 107)}…` : sentence;
}

function toModelOption(model: ListedModel): ModelOption | null {
  const id = modelId(model.name);
  if (!id) return null;
  const description = shortDescription(model.description);
  return {
    id,
    label: typeof model.displayName === 'string' && model.displayName.trim() ? model.displayName.trim() : id,
    note: description ||
      (modelRequestsPerMinute(id) >= 10 ? 'Available for generation with a higher pacing estimate' : 'Available for generation'),
    requestsPerMinute: modelRequestsPerMinute(id),
  };
}

function cacheModels(cacheKey: string, models: ModelOption[]): void {
  if (!cacheKey) return;
  if (modelCache.size >= MODEL_CACHE_LIMIT && !modelCache.has(cacheKey)) {
    const oldest = modelCache.keys().next().value;
    if (typeof oldest === 'string') modelCache.delete(oldest);
  }
  modelCache.set(cacheKey, { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, models });
}

/**
 * Drop the models that answer `generateContent` but cannot do this job — text to
 * speech, image generation, embeddings. They are not hypothetical: a key with
 * the full catalogue enabled returns a dozen of them, and one was capable of
 * being ranked first for slide notes.
 *
 * If the filter would leave nothing, keep the unfiltered list. A wrong guess
 * about a naming convention should cost a cluttered picker, not an app that
 * insists no models exist.
 */
function usableModels(models: ModelOption[], scope: string): ModelOption[] {
  const usable = models.filter((model) => looksTextCapable(model.id));
  if (usable.length > 0) {
    const dropped = models.length - usable.length;
    if (dropped > 0) log.info(scope, `hid ${dropped} non-text model${dropped === 1 ? '' : 's'}`);
    return usable;
  }
  if (models.length > 0) log.warn(scope, 'every discovered model looked non-text; showing all of them');
  return models;
}

/**
 * Ask Google which generation-capable models this key can use. The small
 * in-memory cache avoids a second list request for every explain/chat/practice
 * call while still allowing a newly granted model to appear within minutes.
 */
export async function listAvailableModels(
  apiKey: string,
  signal: AbortSignal,
  timeoutMs = config.requestTimeoutMs,
  forceRefresh = false,
): Promise<ModelOption[]> {
  const cacheKey = await cacheKeyFor(apiKey);
  const cached = cacheKey ? modelCache.get(cacheKey) : undefined;
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return [...cached.models];
  if (!forceRefresh && cached) modelCache.delete(cacheKey);

  const client = createClient(apiKey);
  const deadline = AbortSignal.timeout(Math.max(1_000, timeoutMs));
  const requestSignal = AbortSignal.any([signal, deadline]);

  try {
    const pager = await client.models.list({
      config: {
        pageSize: 100,
        queryBase: true,
        abortSignal: requestSignal,
      },
    });
    const models: ModelOption[] = [];
    const seen = new Set<string>();
    for await (const resource of pager) {
      const model = resource as unknown as ListedModel;
      if (!supportsGeneration(model)) continue;
      const option = toModelOption(model);
      if (!option || seen.has(option.id)) continue;
      seen.add(option.id);
      models.push(option);
    }

    if (models.length === 0) {
      throw new ApiError(
        424,
        'model_unavailable',
        'Google returned no generation-capable models for this API key.',
        true,
      );
    }

    const usable = usableModels(models, 'models');
    usable.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
    cacheModels(cacheKey, usable);
    return [...usable];
  } catch (error) {
    if (signal.aborted) throw new ApiError(499, 'cancelled', 'Request cancelled.');
    if (deadline.aborted) throw new ApiError(504, 'timeout', 'Google took too long to list available models.', true);
    if (error instanceof ApiError) throw error;
    throw fromModelError(error);
  }
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

/** One model, walking the output-tuning ladder until Google accepts a rung. */
async function runModel(client: GoogleGenAI, model: string, options: GenerateOptions): Promise<string> {
  const ladder = tuningLadder(options);
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = AbortSignal.any([options.signal, timeout]);
  const cacheKey = tuningKey(model, options);
  let rung = tuningCache.get(cacheKey) ?? 0;

  for (;;) {
    try {
      const text = await callModel(client, model, options, signal, ladder[rung] ?? {});
      tuningCache.set(cacheKey, rung);
      if (!text.trim()) throw new ApiError(502, 'empty_result', 'The model returned an empty response.', true);
      return text;
    } catch (error) {
      const nextRung = rung + 1;
      if (options.signal.aborted || nextRung >= ladder.length || !looksLikeUnsupportedConfig(error)) throw error;
      log.warn(options.scope, `${model} rejected output tuning ${rung}; trying ${nextRung}`);
      rung = nextRung;
    }
  }
}

/** Nothing about trying a different model helps with any of these. */
function isFatal(error: ApiError): boolean {
  return error.code === 'quota' || error.code === 'invalid_key' || error.code === 'too_large';
}

/**
 * Try the requested model, then a short ladder of substitutes from the same key.
 * Aborts and quota failures stop immediately — retrying those only wastes the
 * user's time and money.
 *
 * The requested model is tried *before* asking Google what models exist, and
 * that ordering is the point. Discovery was once unconditional and first, which
 * put a second round trip in front of every explain, chat and practice call. On
 * a long-lived Node process the five-minute cache hid it; on Workers it did not,
 * because the cache is module state and a Worker isolate is neither long-lived
 * nor alone. The client has already chosen from a catalogue it was shown, so the
 * common case needs no catalogue at all — and the one case that does, a model
 * that has gone away underneath a stored preference, is exactly the case worth
 * spending a round trip on.
 */
export async function generateText(options: GenerateOptions): Promise<GenerateResult> {
  const client = createClient(options.apiKey);
  const attempts: string[] = [];
  let lastError: ApiError | null = null;

  const attempt = async (model: string): Promise<GenerateResult | null> => {
    if (options.signal.aborted) throw new ApiError(499, 'cancelled', 'Request cancelled.');
    const startedAt = Date.now();
    try {
      const text = await runModel(client, model, options);
      log.info(options.scope, `ok via ${model} in ${Date.now() - startedAt}ms`, { chars: text.length });
      return { text, model, attempts };
    } catch (error) {
      const mapped = error instanceof ApiError ? error : fromModelError(error);
      if (options.signal.aborted) throw new ApiError(499, 'cancelled', 'Request cancelled.');
      if (isFatal(mapped)) throw mapped;
      attempts.push(model);
      lastError = mapped;
      log.warn(options.scope, `${model} failed after ${Date.now() - startedAt}ms: ${mapped.message}`);
      return null;
    }
  };

  const requested = resolveModelId(options.requestedModel, '');
  if (requested) {
    const result = await attempt(requested);
    if (result) return result;
  }

  const available = await listAvailableModels(options.apiKey, options.signal, options.timeoutMs);
  const fallback = options.fallbackModel?.trim() || chooseDefaultModel(available, options.purpose);
  const chain = buildModelChain(
    requested,
    fallback,
    available.map((option) => option.id),
    options.purpose,
  ).filter((model) => !attempts.includes(model));

  if (chain.length === 0 && !lastError) {
    throw new ApiError(424, 'model_unavailable', 'No usable generation model was returned for this API key.', true);
  }

  for (const model of chain) {
    const result = await attempt(model);
    if (result) return result;
  }

  throw lastError ?? new ApiError(502, 'server', 'Every model attempt failed. Please try again.', true);
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
