import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultPreferences, keyStore, loadPreferences, savePreferences, type Appearance, type Preferences } from '../lib/storage';

interface PreferencesValue {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  theme: 'light' | 'dark';
  /** Held in state so components re-render when the key is added or cleared. */
  apiKey: string;
  setApiKey: (key: string, remember: boolean) => void;
  clearApiKey: () => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(appearance: Appearance, system: 'light' | 'dark'): 'light' | 'dark' {
  return appearance === 'system' ? system : appearance;
}

export function PreferencesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [prefs, setPrefs] = useState<Preferences>(() => (typeof window === 'undefined' ? defaultPreferences : loadPreferences()));
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme);
  const [apiKey, setApiKeyState] = useState<string>(() => (typeof window === 'undefined' ? '' : keyStore.read()));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const theme = resolveTheme(prefs.appearance, system);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const setApiKey = useCallback((key: string, remember: boolean) => {
    keyStore.write(key, remember);
    setApiKeyState(key.trim());
    update({ rememberKey: remember });
  }, [update]);

  const clearApiKey = useCallback(() => {
    keyStore.clear();
    setApiKeyState('');
  }, []);

  const value = useMemo<PreferencesValue>(
    () => ({ prefs, update, theme, apiKey, setApiKey, clearApiKey }),
    [prefs, update, theme, apiKey, setApiKey, clearApiKey],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
