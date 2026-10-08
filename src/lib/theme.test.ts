/**
 * theme.test.ts — app-facing theme helpers. These touch browser globals, so the
 * suite runs under jsdom (the project default). matchMedia is not implemented by
 * jsdom; the helpers guard for that and we also stub it where needed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  readStoredPrefs,
  writeStoredPrefs,
  applyTheme,
  resolveActiveMode,
  prefersDark,
  subscribeToSystemMode,
} from './theme';
import { DEFAULT_PREFS, resolveTokens, type ThemePrefs } from './theme-core';

describe('readStoredPrefs / writeStoredPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredPrefs()).toBeNull();
  });

  it('round-trips a valid prefs blob', () => {
    const prefs: ThemePrefs = { mode: 'light', accent: '#AABBCC' };
    writeStoredPrefs(prefs);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify(prefs));
    expect(readStoredPrefs()).toEqual(prefs);
  });

  it('normalizes a malformed stored blob to defaults', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '{ not json');
    expect(readStoredPrefs()).toBeNull();
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode: 'weird' }));
    expect(readStoredPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-mode');
    document.documentElement.removeAttribute('style');
  });

  it('sets data-mode and writes every resolved token on <html>', () => {
    applyTheme(DEFAULT_PREFS, 'dark');
    const el = document.documentElement;
    expect(el.getAttribute('data-mode')).toBe('dark');
    const tokens = resolveTokens(DEFAULT_PREFS, 'dark');
    for (const [key, value] of Object.entries(tokens)) {
      expect(el.style.getPropertyValue(key)).toBe(value);
    }
  });
});

describe('resolveActiveMode / prefersDark', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('honors an explicit light/dark mode regardless of OS', () => {
    expect(resolveActiveMode({ mode: 'light', accent: '#FFB547' })).toBe('light');
    expect(resolveActiveMode({ mode: 'dark', accent: '#FFB547' })).toBe('dark');
  });

  it('resolves system via matchMedia when available', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('dark'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(prefersDark()).toBe(true);
    expect(resolveActiveMode({ mode: 'system', accent: '#FFB547' })).toBe('dark');
  });

  it('treats system as light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersDark()).toBe(false);
    expect(resolveActiveMode({ mode: 'system', accent: '#FFB547' })).toBe(
      'light',
    );
  });
});

describe('subscribeToSystemMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers and tears down a change listener', () => {
    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: add,
      removeEventListener: remove,
    }));
    const unsub = subscribeToSystemMode(() => {});
    expect(add).toHaveBeenCalledTimes(1);
    unsub();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const unsub = subscribeToSystemMode(() => {});
    expect(() => unsub()).not.toThrow();
  });
});
