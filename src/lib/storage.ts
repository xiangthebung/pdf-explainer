import { DEFAULT_CHAT_MODEL, DEFAULT_EXPLAIN_MODEL, DEFAULT_PRACTICE_MODEL } from '~shared/models';
import type { StudyStyle } from '~shared/types';
import type { SessionSnapshot, SessionSummary } from '../state/types';

/**
 * Local persistence.
 *
 * Three separate concerns, three different stores, on purpose:
 *  - preferences: localStorage, tiny and safe to keep
 *  - API key: sessionStorage by default, localStorage only on explicit opt-in
 *  - study sessions: IndexedDB, because a deck plus notes is megabytes
 *
 * Nothing here is ever logged, and the key is never included in a session.
 */

export type Appearance = 'system' | 'light' | 'dark';

export interface Preferences {
  appearance: Appearance;
  explainModel: string;
  chatModel: string;
  practiceModel: string;
  style: StudyStyle;
  customInstructions: string;
  panelWidth: number;
  /** Study panel hidden, so the slide gets the whole window. */
  panelCollapsed: boolean;
  /**
   * `docked` splits the window with the slide. `overlay` floats the notes on
   * top of a full-bleed slide, translucent until you reach for them.
   */
  panelMode: PanelMode;
  /** Keep the floating notes fully opaque instead of fading them out. */
  overlayPinned: boolean;
  filmstrip: boolean;
  rememberKey: boolean;
}

export type PanelMode = 'docked' | 'overlay';

const PREFS_KEY = 'pdfx.prefs';
const APPEARANCE_KEY = 'pdfx.appearance';
const API_KEY = 'pdfx.gemini-key';
const REMEMBER_KEY = 'pdfx.remember-key';

export const defaultPreferences: Preferences = {
  appearance: 'system',
  explainModel: DEFAULT_EXPLAIN_MODEL,
  chatModel: DEFAULT_CHAT_MODEL,
  practiceModel: DEFAULT_PRACTICE_MODEL,
  style: 'auto',
  customInstructions: '',
  panelWidth: 460,
  panelCollapsed: false,
  panelMode: 'docked',
  overlayPinned: false,
  filmstrip: true,
  rememberKey: false,
};

function safeLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadPreferences(): Preferences {
  const store = safeLocal();
  if (!store) return { ...defaultPreferences };
  try {
    const raw = store.getItem(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Preferences>) : {};
    const merged: Preferences = { ...defaultPreferences, ...parsed };
    merged.panelWidth = Math.min(760, Math.max(340, Number(merged.panelWidth) || defaultPreferences.panelWidth));
    merged.panelMode = merged.panelMode === 'overlay' ? 'overlay' : 'docked';
    merged.rememberKey = store.getItem(REMEMBER_KEY) === 'true';
    return merged;
  } catch {
    return { ...defaultPreferences };
  }
}

export function savePreferences(prefs: Preferences): void {
  const store = safeLocal();
  if (!store) return;
  try {
    const { rememberKey, ...rest } = prefs;
    store.setItem(PREFS_KEY, JSON.stringify(rest));
    store.setItem(APPEARANCE_KEY, prefs.appearance);
    store.setItem(REMEMBER_KEY, String(rememberKey));
  } catch {
    /* private mode or full quota: preferences simply do not stick */
  }
}

/* -------------------------------------------------------------------------- */
/* API key                                                                     */
/* -------------------------------------------------------------------------- */

export const keyStore = {
  read(): string {
    return safeSession()?.getItem(API_KEY) ?? safeLocal()?.getItem(API_KEY) ?? '';
  },
  write(key: string, remember: boolean): void {
    const trimmed = key.trim();
    const session = safeSession();
    const local = safeLocal();
    try {
      if (!trimmed) {
        session?.removeItem(API_KEY);
        local?.removeItem(API_KEY);
        return;
      }
      session?.setItem(API_KEY, trimmed);
      if (remember) local?.setItem(API_KEY, trimmed);
      else local?.removeItem(API_KEY);
    } catch {
      /* nothing we can do; the key stays in memory for this tab only */
    }
  },
  clear(): void {
    try {
      safeSession()?.removeItem(API_KEY);
      safeLocal()?.removeItem(API_KEY);
    } catch {
      /* ignore */
    }
  },
  /** For display only — never render the full key. */
  mask(key: string): string {
    const trimmed = key.trim();
    if (trimmed.length < 8) return '••••';
    return `••••••••${trimmed.slice(-4)}`;
  },
};

/* -------------------------------------------------------------------------- */
/* sessions (IndexedDB)                                                        */
/* -------------------------------------------------------------------------- */

const DB_NAME = 'pdf-explainer';
const DB_VERSION = 1;
const STORE = 'sessions';
const MAX_SESSIONS = 4;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(STORE, mode);
          const request = run(tx.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export const sessionStore = {
  async save(snapshot: SessionSnapshot): Promise<void> {
    await transact('readwrite', (store) => store.put(snapshot) as IDBRequest<IDBValidKey>);
    await sessionStore.prune();
  },

  async load(id: string): Promise<SessionSnapshot | null> {
    const result = await transact<SessionSnapshot | undefined>('readonly', (store) => store.get(id));
    return result ?? null;
  },

  async list(): Promise<SessionSummary[]> {
    const all = await transact<SessionSnapshot[]>('readonly', (store) => store.getAll());
    if (!all) return [];
    return all
      .filter((entry): entry is SessionSnapshot => Boolean(entry?.id && entry?.base64))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        totalSlides: entry.totalSlides,
        explainedSlides: entry.notes?.length ?? 0,
        currentSlide: entry.currentSlide,
        updatedAt: entry.updatedAt,
        isDemo: Boolean(entry.isDemo),
      }));
  },

  async remove(id: string): Promise<void> {
    await transact('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);
  },

  /** Keep the most recent handful; a deck plus notes is not small. */
  async prune(): Promise<void> {
    const summaries = await sessionStore.list();
    const stale = summaries.slice(MAX_SESSIONS);
    for (const entry of stale) await sessionStore.remove(entry.id);
  },

  async clearAll(): Promise<void> {
    await transact('readwrite', (store) => store.clear() as unknown as IDBRequest<undefined>);
  },
};

export function newSessionId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
