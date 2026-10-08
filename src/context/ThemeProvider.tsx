/**
 * ThemeProvider — the source of truth for theme preferences after hydration.
 *
 * Persistence model (design "Theme Persistence & No-Flash"):
 *  - ALWAYS write cb-theme to localStorage on change (what the pre-paint stub
 *    reads on the next load, so the first paint matches).
 *  - If logged in, ALSO persist to profiles.theme_preferences via
 *    update({ theme_preferences }).eq('id', uid). This is allowed by Policy A
 *    (profiles_update_self) because the role is unchanged.
 *  - On login, DB prefs win over localStorage (then localStorage is synced to
 *    match); if the DB is empty ('{}' → defaults), the current localStorage
 *    prefs are pushed up.
 *  - Anonymous: localStorage only; no DB row is created or required.
 *  - 'system' mode subscribes to matchMedia and re-resolves live, no reload.
 *
 * Theme changes only ever touch the current user's localStorage and (if logged
 * in) their own profile row — never anyone else's (acceptance criterion 4).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from './SessionProvider';
import { DEFAULT_PREFS, type ThemePrefs } from '../lib/theme-core';
import {
  applyTheme,
  readStoredPrefs,
  resolveActiveMode,
  subscribeToSystemMode,
  writeStoredPrefs,
} from '../lib/theme';

interface ThemeContextValue {
  prefs: ThemePrefs;
  /** Merge a partial preference change, apply, and persist to all stores. */
  setPrefs: (patch: Partial<ThemePrefs>) => void;
  /** Reset to amber / system / no tints and persist. */
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Persist to the logged-in user's own profile row. Trusts Policy A. */
async function persistToProfile(uid: string, prefs: ThemePrefs): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from('profiles')
      .update({ theme_preferences: prefs })
      .eq('id', uid);
  } catch {
    // Network hiccup: localStorage already holds it; retried on next change.
  }
}

/** True when a prefs blob is just the defaults (an empty profile jsonb '{}'). */
function isDefaultPrefs(p: ThemePrefs): boolean {
  return (
    p.mode === DEFAULT_PREFS.mode &&
    p.accent === DEFAULT_PREFS.accent &&
    p.bgTint === undefined &&
    p.surfaceTint === undefined
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useSession();

  // Hydrate synchronously from localStorage so React state matches the paint
  // the pre-paint bootstrap already produced (no flash, no second resolve).
  const [prefs, setPrefsState] = useState<ThemePrefs>(
    () => readStoredPrefs() ?? { ...DEFAULT_PREFS },
  );

  // Which user id we have already reconciled DB<->localStorage for, so the
  // login reconciliation runs once per user and not on every prefs change.
  const reconciledFor = useRef<string | null>(null);

  // Apply tokens on every prefs change.
  useEffect(() => {
    applyTheme(prefs, resolveActiveMode(prefs));
  }, [prefs]);

  // 'system' mode: re-resolve live when the OS theme flips.
  useEffect(() => {
    if (prefs.mode !== 'system') return;
    return subscribeToSystemMode(() => {
      applyTheme(prefs, resolveActiveMode(prefs));
    });
  }, [prefs]);

  // On login, reconcile DB prefs with localStorage: DB wins if present; else
  // push localStorage up. Runs once per authenticated user.
  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (!uid || !profile) {
      if (!uid) reconciledFor.current = null;
      return;
    }
    if (reconciledFor.current === uid) return;
    reconciledFor.current = uid;

    const dbPrefs = profile.themePreferences;
    if (!isDefaultPrefs(dbPrefs)) {
      // DB wins: adopt it and sync localStorage so the next pre-paint matches.
      setPrefsState(dbPrefs);
      writeStoredPrefs(dbPrefs);
    } else {
      // DB empty: push the current (local/default) prefs up.
      writeStoredPrefs(prefs);
      void persistToProfile(uid, prefs);
    }
    // prefs is intentionally read as a snapshot here; adding it as a dep would
    // re-run reconciliation on every edit. reconciledFor guards single-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, profile]);

  const commit = useCallback(
    (next: ThemePrefs) => {
      setPrefsState(next);
      writeStoredPrefs(next);
      if (uid) void persistToProfile(uid, next);
    },
    [uid],
  );

  const setPrefs = useCallback(
    (patch: Partial<ThemePrefs>) => {
      setPrefsState((current) => {
        const next: ThemePrefs = { ...current, ...patch };
        // Normalize optional tints: an explicit undefined clears them.
        if ('bgTint' in patch && patch.bgTint === undefined) delete next.bgTint;
        if ('surfaceTint' in patch && patch.surfaceTint === undefined) {
          delete next.surfaceTint;
        }
        writeStoredPrefs(next);
        if (uid) void persistToProfile(uid, next);
        return next;
      });
    },
    [uid],
  );

  const reset = useCallback(() => {
    commit({ ...DEFAULT_PREFS });
  }, [commit]);

  const value = useMemo<ThemeContextValue>(
    () => ({ prefs, setPrefs, reset }),
    [prefs, setPrefs, reset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
