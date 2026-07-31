/**
 * Settings, read from an environment rather than from `process`.
 *
 * This used to open with `import 'dotenv/config'` and read `process.env` at module scope,
 * which was fine while there was one way to run the server and stopped being fine the
 * moment there were two. On Cloudflare Workers there is no `process` to read at import
 * time and no `.env` file to load: configuration arrives as the `env` argument of the
 * `fetch` handler, on the first request, after every module has already been evaluated.
 *
 * So the shape is: build a config from any string map, and let whoever owns the entry
 * point say which map. `server/index.ts` loads `.env` and hands over `process.env`;
 * `worker/index.ts` hands over its binding object. Nothing else in the codebase changes,
 * because `config` stays a live ESM binding that everything reads through at call time.
 */

export interface AppConfig {
  readonly port: number;
  readonly isProduction: boolean;
  /** Present only in memory; never returned to the browser, never logged. */
  readonly serverApiKey: string;
  readonly hasServerKey: boolean;
  /**
   * Force people to bring their own key even when the server has one.
   * Defaults to true when no server key is configured.
   */
  readonly requireUserKey: boolean;
  readonly maxUploadMb: number;
  readonly requestTimeoutMs: number;
  readonly chatTimeoutMs: number;
  /** Simple abuse guard for deployed instances. */
  readonly rateLimit: { readonly windowMs: number; readonly max: number };
  /**
   * How many reverse proxies stand in front of this server, or empty for none.
   *
   * The rate limiter keys on the caller's address, and that address is only the caller's
   * if Express has been told what to trust. Unset behind a proxy, every request appears to
   * come from the proxy, so the whole internet shares one bucket and the abuse guard
   * becomes a self-inflicted outage. Set too permissively, a caller can put whatever it
   * likes in `X-Forwarded-For` and get a fresh bucket per request, so the guard becomes
   * decoration.
   *
   * The right value is the number of hops actually in front of the process, which only
   * whoever deployed it knows. So it is configuration with no default rather than a guess:
   * empty is correct for running it locally, and every platform that terminates TLS for
   * you needs at least `TRUST_PROXY=1`.
   *
   * Unused on Workers, which puts the caller's address in `CF-Connecting-IP` and does not
   * let anyone else write it.
   */
  readonly trustProxy: string;
}

export type EnvSource = Record<string, string | undefined>;

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function buildConfig(env: EnvSource): AppConfig {
  const serverKey = text(env.GEMINI_API_KEY);
  return {
    port: parseNumber(env.PORT, 3000),
    isProduction: env.NODE_ENV === 'production',
    serverApiKey: serverKey,
    hasServerKey: serverKey.length > 0,
    requireUserKey: serverKey ? env.REQUIRE_USER_API_KEY === 'true' : true,
    maxUploadMb: parseNumber(env.MAX_UPLOAD_MB, 32),
    requestTimeoutMs: parseNumber(env.REQUEST_TIMEOUT_MS, 240_000),
    chatTimeoutMs: parseNumber(env.CHAT_TIMEOUT_MS, 90_000),
    rateLimit: {
      windowMs: parseNumber(env.RATE_LIMIT_WINDOW_MS, 60_000),
      max: parseNumber(env.RATE_LIMIT_MAX, 40),
    },
    trustProxy: text(env.TRUST_PROXY),
  };
}

/**
 * The current settings.
 *
 * `let` and a live binding, deliberately. Every module here reads `config.something` at
 * call time rather than destructuring at import time, so reassigning this is visible
 * everywhere at once — which is what lets a Worker configure itself on its first request
 * without threading a config object through every function signature.
 *
 * The default is an empty environment, which is a working configuration: no server key
 * means every caller brings their own, which is the mode this is deployed in.
 */
export let config: AppConfig = buildConfig({});

/** Called once by whichever entry point owns the process. */
export function configure(env: EnvSource): void {
  config = buildConfig(env);
}

/** Express's JSON body ceiling. Base64 inflates by 4/3, plus room for the envelope. */
export function jsonBodyLimit(): string {
  return `${config.maxUploadMb + 6}mb`;
}
