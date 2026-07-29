import 'dotenv/config';

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const serverKey = (process.env.GEMINI_API_KEY ?? '').trim();

export const config = {
  port: parseNumber(process.env.PORT, 3000),
  isProduction: process.env.NODE_ENV === 'production',
  /** Present only in memory; never returned to the browser, never logged. */
  serverApiKey: serverKey,
  hasServerKey: serverKey.length > 0,
  /**
   * Force people to bring their own key even when the server has one.
   * Defaults to true when no server key is configured.
   */
  requireUserKey: serverKey ? process.env.REQUIRE_USER_API_KEY === 'true' : true,
  maxUploadMb: parseNumber(process.env.MAX_UPLOAD_MB, 32),
  requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 240_000),
  chatTimeoutMs: parseNumber(process.env.CHAT_TIMEOUT_MS, 90_000),
  /** Simple abuse guard for deployed instances. */
  rateLimit: {
    windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: parseNumber(process.env.RATE_LIMIT_MAX, 40),
  },
  /**
   * How many reverse proxies stand in front of this server, or empty for none.
   *
   * The rate limiter above keys on `req.ip`, and that address is only the caller's
   * if Express has been told what to trust. Unset behind a proxy, every request
   * appears to come from the proxy, so the whole internet shares one bucket and the
   * abuse guard becomes a self-inflicted outage. Set too permissively, a caller can
   * put whatever it likes in `X-Forwarded-For` and get a fresh bucket per request,
   * so the guard becomes decoration.
   *
   * The right value is the number of hops actually in front of the process, which
   * only whoever deployed it knows. So it is configuration with no default rather
   * than a guess: empty is correct for running it locally, and every platform that
   * terminates TLS for you needs at least `TRUST_PROXY=1`.
   */
  trustProxy: (process.env.TRUST_PROXY ?? '').trim(),
} as const;

export const jsonBodyLimit = `${config.maxUploadMb + 6}mb`;
