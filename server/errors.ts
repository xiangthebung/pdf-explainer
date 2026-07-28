import type { ApiErrorCode } from '../shared/types';
import { redact } from './log';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryable: boolean;

  constructor(status: number, code: ApiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export const missingKey = () =>
  new ApiError(
    400,
    'missing_key',
    'A Gemini API key is required. Add one in Settings — it stays on this device and is only used to call Google.',
  );

/**
 * Turn a Google GenAI failure into something a student can act on, without
 * leaking keys, prompts, or stack traces.
 */
export function fromModelError(error: unknown): ApiError {
  const raw = redact(error instanceof Error ? error.message : String(error));
  const text = raw.toLowerCase();
  const status = typeof (error as { status?: number })?.status === 'number' ? (error as { status: number }).status : 0;

  if (text.includes('abort') || text.includes('cancel')) {
    return new ApiError(499, 'cancelled', 'Request cancelled.');
  }
  if (status === 401 || status === 403 || text.includes('api key not valid') || text.includes('permission denied')) {
    return new ApiError(401, 'invalid_key', 'That API key was rejected by Google. Check the key and try again.');
  }
  if (status === 429 || text.includes('quota') || text.includes('rate limit') || text.includes('resource_exhausted')) {
    return new ApiError(
      429,
      'quota',
      'Your Gemini quota is exhausted or rate limited. Wait a moment, or pick a lighter model.',
      true,
    );
  }
  if (status === 404 || text.includes('not found') || text.includes('is not supported')) {
    return new ApiError(
      424,
      'model_unavailable',
      'That model is not available for this key. Try another model from the picker.',
      true,
    );
  }
  if (text.includes('timeout') || text.includes('deadline')) {
    return new ApiError(504, 'timeout', 'Google took too long to answer. Try a smaller slide range.', true);
  }
  if (text.includes('too large') || text.includes('payload') || status === 413) {
    return new ApiError(413, 'too_large', 'That PDF is too large for one request. Try a smaller file.', false);
  }
  return new ApiError(502, 'server', 'The AI service failed to answer. Please try again.', true);
}
