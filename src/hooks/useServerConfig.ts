import { useEffect, useState } from 'react';
import { MODEL_OPTIONS } from '~shared/models';
import type { ServerConfig } from '~shared/types';
import { api } from '../lib/api';

const FALLBACK: ServerConfig = {
  hasServerKey: false,
  requireUserKey: true,
  models: MODEL_OPTIONS,
  maxUploadMb: 32,
};

/**
 * Server capabilities: whether a key is needed, which models are offered, and
 * the upload ceiling. Falls back to safe defaults so the UI still works if the
 * endpoint is unreachable.
 */
export function useServerConfig(): ServerConfig {
  const [config, setConfig] = useState<ServerConfig>(FALLBACK);

  useEffect(() => {
    const controller = new AbortController();
    api
      .config(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setConfig({
          hasServerKey: Boolean(next.hasServerKey),
          requireUserKey: next.requireUserKey !== false,
          models: Array.isArray(next.models) && next.models.length ? next.models : MODEL_OPTIONS,
          maxUploadMb: Number(next.maxUploadMb) > 0 ? Number(next.maxUploadMb) : FALLBACK.maxUploadMb,
        });
      })
      .catch(() => {
        /* keep the fallback; the upload screen will still explain what is needed */
      });
    return () => controller.abort();
  }, []);

  return config;
}
