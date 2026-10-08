/**
 * theme.ts — app-facing theme helpers layered over the dependency-free
 * theme-core. These DO touch browser globals (document, localStorage,
 * matchMedia), so they live here and NOT in theme-core (which must stay
 * bundleable as the pre-paint esbuild entry).
 *
 * The localStorage key and stored shape are identical to what the pre-paint
 * inline bootstrap in vite.config.ts reads, so the first paint always matches
 * the runtime ThemeProvider.
 */
import {
  resolveTokens,
  resolveMode,
  normalizePrefs,
  type ThemePrefs,
  type ResolvedMode,
} from './theme-core';

/** The localStorage key the pre-paint bootstrap and the runtime share. */
export const THEME_STORAGE_KEY = 'cb-theme';

/** matchMedia query for the OS dark-mode preference. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Does the OS currently prefer dark? Safe when matchMedia is unavailable. */
export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Resolve a stored mode ('system') to a concrete light/dark against the OS. */
export function resolveActiveMode(prefs: ThemePrefs): ResolvedMode {
  return resolveMode(prefs.mode, prefersDark());
}

/**
 * Apply the resolved token map to <html>: set data-mode and write every custom
 * property inline, exactly like the pre-paint stub does. This is the single
 * runtime application path used by ThemeProvider.
 */
export function applyTheme(prefs: ThemePrefs, mode: ResolvedMode): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.setAttribute('data-mode', mode);
  const tokens = resolveTokens(prefs, mode);
  for (const key of Object.keys(tokens)) {
    el.style.setProperty(key, tokens[key]);
  }
}

/** Read + defensively parse the stored prefs. Missing/malformed → null. */
export function readStoredPrefs(): ThemePrefs | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist prefs to localStorage in the shape the bootstrap parses. */
export function writeStoredPrefs(prefs: ThemePrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable (private mode); theme still applies live */
  }
}

/**
 * Subscribe to OS dark-mode changes (for 'system' mode live re-resolution).
 * Returns an unsubscribe function; a no-op when matchMedia is unavailable.
 */
export function subscribeToSystemMode(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia(DARK_QUERY);
  } catch {
    return () => {};
  }
  const handler = () => onChange();
  // addEventListener is the modern API; older Safari used addListener.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  mql.addListener(handler);
  return () => mql.removeListener(handler);
}
