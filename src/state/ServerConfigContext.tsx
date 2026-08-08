import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ModelOption, ServerConfig } from '~shared/types';
import { api } from '../lib/api';
import { usePreferences } from './PreferencesContext';

/**
 * What the server can do, and which models this key can actually call.
 *
 * This began as a hook with its own `useState`, which meant every component that
 * wanted to know the model list started its own copy of the conversation. Four
 * of them did: the study provider, the upload screen, the practice panel and the
 * settings sheet — three mounted at once on the upload screen alone, since the
 * settings sheet is mounted while closed. Each fired `GET /api/config` and
 * `POST /api/models`, all three missed the server's cache because they raced,
 * and all three reached Google. Three round trips and three rate-limiter slots
 * to answer one question that has one answer.
 *
 * So it is a provider. One request, one state, everyone reads it.
 *
 * Two requests rather than one, though, and deliberately: capabilities are
 * keyless and static, and the model list is per key. Keeping them apart is what
 * lets the key stay out of a cacheable GET, and it means changing a key refetches
 * the catalogue without refetching what the server can do.
 */

const FALLBACK: ServerConfig = {
  hasServerKey: false,
  requireUserKey: true,
  models: [],
  maxUploadMb: 32,
};

export interface ServerConfigState extends ServerConfig {
  /** The model list is in flight. Capabilities are not worth a spinner. */
  modelsLoading: boolean;
  modelsError: string | null;
  reloadModels: () => void;
}

/**
 * The model list arrives over the network, so it is untrusted input like any
 * other. Anything that is not a usable option is dropped rather than patched.
 */
function readModels(value: unknown): ModelOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim()) return [];
    const rpm = Number(item.requestsPerMinute);
    return [
      {
        id: item.id.trim(),
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : item.id.trim(),
        note: typeof item.note === 'string' ? item.note : '',
        requestsPerMinute: Number.isFinite(rpm) && rpm > 0 ? rpm : 5,
      },
    ];
  });
}

function readCapabilities(response: ServerConfig): ServerConfig {
  return {
    hasServerKey: Boolean(response.hasServerKey),
    requireUserKey: response.requireUserKey !== false,
    models: [],
    maxUploadMb: Number(response.maxUploadMb) > 0 ? Number(response.maxUploadMb) : FALLBACK.maxUploadMb,
  };
}

function modelErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return message || 'Could not load the models available to this API key. Try again.';
}

const ServerConfigContext = createContext<ServerConfigState | null>(null);

export function ServerConfigProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { apiKey } = usePreferences();
  // `null` until the keyless capability request settles, so the model request
  // below knows whether a keyless visitor is entitled to a catalogue at all.
  const [capabilities, setCapabilities] = useState<ServerConfig | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reloadModels = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .config(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setCapabilities(readCapabilities(response));
      })
      .catch(() => {
        /* Keep the conservative fallback: a key is required. The upload screen
           still explains what is needed, and a supplied key is still tried. */
        if (!controller.signal.aborted) setCapabilities(FALLBACK);
      });
    return () => controller.abort();
  }, []);

  const key = apiKey.trim();
  const settled = capabilities ?? null;

  useEffect(() => {
    if (!settled) return;
    const controller = new AbortController();

    // Drop the previous key's catalogue at once. Showing one key's models while
    // another key's request is in flight is worse than showing none.
    setModels([]);
    setModelsError(null);

    if (settled.requireUserKey && !key) {
      setModelsLoading(false);
      return () => controller.abort();
    }

    setModelsLoading(true);
    api
      .models(key || undefined, controller.signal, reloadToken > 0)
      .then((response) => {
        if (controller.signal.aborted) return;
        const next = readModels(response.models);
        if (next.length === 0) throw new Error('Google returned no usable models for this API key.');
        setModels(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setModelsError(modelErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });

    return () => controller.abort();
  }, [settled, key, reloadToken]);

  const value = useMemo<ServerConfigState>(
    () => ({ ...(capabilities ?? FALLBACK), models, modelsLoading, modelsError, reloadModels }),
    [capabilities, models, modelsLoading, modelsError, reloadModels],
  );

  return <ServerConfigContext.Provider value={value}>{children}</ServerConfigContext.Provider>;
}

export function useServerConfig(): ServerConfigState {
  const value = useContext(ServerConfigContext);
  if (!value) throw new Error('useServerConfig must be used inside ServerConfigProvider');
  return value;
}
