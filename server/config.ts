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
} as const;

export const jsonBodyLimit = `${config.maxUploadMb + 6}mb`;
