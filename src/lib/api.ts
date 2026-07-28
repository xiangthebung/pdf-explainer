import type {
  ApiErrorCode,
  ChatRequest,
  ExplainBatch,
  ExplainRequest,
  PracticeRequest,
  PracticeSet,
  ServerConfig,
} from '~shared/types';

/**
 * The single place the browser talks to our API.
 *
 * Every call is cancellable, every failure lands as an `ApiFailure` with a
 * stable code so the UI can choose the right recovery affordance instead of
 * dumping a raw string at the user.
 */

export class ApiFailure extends Error {
  readonly code: ApiErrorCode;
  readonly retryable: boolean;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, options: { retryable?: boolean; status?: number } = {}) {
    super(message);
    this.name = 'ApiFailure';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? 0;
  }
}

export function isCancelled(error: unknown): boolean {
  if (error instanceof ApiFailure) return error.code === 'cancelled';
  return error instanceof DOMException && error.name === 'AbortError';
}

function describeHtml(body: string): string {
  const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const heading = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.trim();
  const detail = heading || title;
  return detail
    ? `The server returned a web page instead of data (${detail}). This usually means a proxy timed out or the upload was too large.`
    : 'The server returned a web page instead of data. This usually means a proxy timed out or the upload was too large.';
}

async function readFailure(response: Response): Promise<ApiFailure> {
  const contentType = response.headers.get('content-type') ?? '';
  let text = '';
  try {
    text = await response.text();
  } catch {
    /* body already consumed or connection dropped */
  }

  if (contentType.includes('application/json') && text) {
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: ApiErrorCode; retryable?: boolean };
      return new ApiFailure(parsed.code ?? 'server', parsed.error ?? 'The request failed.', {
        retryable: parsed.retryable ?? response.status >= 500,
        status: response.status,
      });
    } catch {
      /* fall through to the generic paths below */
    }
  }

  if (/<!DOCTYPE|<html|<body/i.test(text)) {
    return new ApiFailure('server', describeHtml(text), { retryable: true, status: response.status });
  }
  if (response.status === 413) {
    return new ApiFailure('too_large', 'That file is too large to send.', { status: 413 });
  }
  return new ApiFailure('server', text.trim().slice(0, 300) || `Request failed (${response.status}).`, {
    retryable: response.status >= 500,
    status: response.status,
  });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (isCancelled(error)) throw new ApiFailure('cancelled', 'Request cancelled.');
    throw new ApiFailure('network', 'Cannot reach the server. Check your connection and try again.', {
      retryable: true,
    });
  }

  // 499 is what our server sends when it notices the client hung up.
  if (response.status === 499) throw new ApiFailure('cancelled', 'Request cancelled.');
  if (!response.ok) throw await readFailure(response);

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw /<!DOCTYPE|<html/i.test(text)
      ? new ApiFailure('server', describeHtml(text), { retryable: true })
      : new ApiFailure('server', 'The server sent an unexpected response.', { retryable: true });
  }

  return (await response.json()) as T;
}

function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export interface ResponseMeta {
  model: string;
  repaired?: boolean;
  truncated?: boolean;
  /** Slide window a practice batch covered. */
  from?: number;
  to?: number;
}

export const api = {
  config(signal?: AbortSignal): Promise<ServerConfig> {
    return request<ServerConfig>('/api/config', { method: 'GET', signal });
  },
  explain(payload: ExplainRequest, signal?: AbortSignal): Promise<{ batch: ExplainBatch; meta: ResponseMeta }> {
    return post('/api/explain', payload, signal);
  },
  practice(payload: PracticeRequest, signal?: AbortSignal): Promise<{ set: PracticeSet; meta: ResponseMeta }> {
    return post('/api/practice', payload, signal);
  },
  chat(payload: ChatRequest, signal?: AbortSignal): Promise<{ reply: string; meta: ResponseMeta }> {
    return post('/api/chat', payload, signal);
  },
};
