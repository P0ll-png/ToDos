import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  relativeLuminance,
  hexToRgb,
  pickReadable,
  adjustForAA,
  resolveTokens,
  resolveMode,
  normalizePrefs,
  DEFAULT_PREFS,
  DARK_BASE,
  LIGHT_BASE,
  AA_NORMAL,
} from './theme-core';

describe('contrast math', () => {
  it('black vs white is 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('same color is 1:1', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('relative luminance of white is 1 and black is 0', () => {
    expect(relativeLuminance(hexToRgb('#FFFFFF'))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hexToRgb('#000000'))).toBeCloseTo(0, 5);
  });

  it('pickReadable chooses the higher-ratio color', () => {
    // default amber is light -> black is more readable on it
    expect(pickReadable('#FFB547')).toBe('#000000');
    // dark navy -> white is more readable
    expect(pickReadable('#0E1726')).toBe('#FFFFFF');
  });
});

describe('adjustForAA', () => {
  it('returns a mid-tone accent unchanged when it already clears AA', () => {
    // dark text-ish color on white already passes
    const surface = '#FFFFFF';
    const accent = '#2A2A2A';
    expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(adjustForAA(accent, surface, 'light')).toBe(accent);
  });

  it('darkens a too-light accent in light mode until it passes', () => {
    const surface = '#FFFFFF';
    const accent = '#FFB547'; // ~1.76:1 on white, fails
    const result = adjustForAA(accent, surface, 'light');
    expect(result).not.toBeNull();
    expect(contrastRatio(result as string, surface)).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it('lightens a too-dark accent in dark mode until it passes', () => {
    const surface = '#15223A';
    const accent = '#111111'; // too dark against dark surface
    const result = adjustForAA(accent, surface, 'dark');
    expect(result).not.toBeNull();
    expect(contrastRatio(result as string, surface)).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it('falls back to null when AA is unreachable within 50 steps', () => {
    // white accent on white surface in dark mode (lighten only) can never clear
    const result = adjustForAA('#FFFFFF', '#FFFFFF', 'dark');
    expect(result).toBeNull();
  });
});

describe('resolveTokens', () => {
  it('produces the dark base when mode is dark and no overrides', () => {
    const tokens = resolveTokens(DEFAULT_PREFS, 'dark');
    expect(tokens['--bg']).toBe(DARK_BASE.bg);
    expect(tokens['--surface']).toBe(DARK_BASE.surface);
    expect(tokens['--text']).toBe(DARK_BASE.text);
    expect(tokens['--accent']).toBe('#FFB547');
    expect(tokens['--danger']).toBe(DARK_BASE.danger);
    expect(tokens['--dot-ring']).toBe(DARK_BASE.text);
    expect(tokens['--focus-ring']).toBe(tokens['--accent-text']);
  });

  it('produces the light base when mode is light', () => {
    const tokens = resolveTokens(DEFAULT_PREFS, 'light');
    expect(tokens['--bg']).toBe(LIGHT_BASE.bg);
    expect(tokens['--surface']).toBe(LIGHT_BASE.surface);
    expect(tokens['--danger']).toBe(LIGHT_BASE.danger);
  });

  it('keeps the user accent fill when switching modes', () => {
    const prefs = { ...DEFAULT_PREFS, accent: '#3366FF' };
    const dark = resolveTokens(prefs, 'dark');
    const light = resolveTokens(prefs, 'light');
    expect(dark['--accent']).toBe('#3366FF');
    expect(light['--accent']).toBe('#3366FF');
  });

  it('overlays bg/surface tints when present', () => {
    const prefs = {
      ...DEFAULT_PREFS,
      bgTint: '#101010',
      surfaceTint: '#202020',
    };
    const tokens = resolveTokens(prefs, 'dark');
    expect(tokens['--bg']).toBe('#101010');
    expect(tokens['--surface']).toBe('#202020');
  });

  it('--accent-text clears AA against both bg and surface, or falls back to --text', () => {
    const tokens = resolveTokens(DEFAULT_PREFS, 'light');
    const accentText = tokens['--accent-text'];
    const okBothOrFallback =
      (contrastRatio(accentText, tokens['--bg']) >= AA_NORMAL &&
        contrastRatio(accentText, tokens['--surface']) >= AA_NORMAL) ||
      accentText === tokens['--text'];
    expect(okBothOrFallback).toBe(true);
  });

  it('emits an rgba --accent-weak', () => {
    const tokens = resolveTokens(DEFAULT_PREFS, 'dark');
    expect(tokens['--accent-weak']).toMatch(/^rgba\(/);
  });
});

describe('resolveMode', () => {
  it('resolves system via prefersDark', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
});

describe('normalizePrefs', () => {
  it('falls back to defaults for garbage input', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs('nope')).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ mode: 'weird', accent: 'xyz' })).toEqual(
      DEFAULT_PREFS,
    );
  });

  it('keeps valid fields and drops invalid tints', () => {
    const prefs = normalizePrefs({
      mode: 'light',
      accent: '#AABBCC',
      bgTint: 'bad',
      surfaceTint: '#112233',
    });
    expect(prefs.mode).toBe('light');
    expect(prefs.accent).toBe('#AABBCC');
    expect(prefs.bgTint).toBeUndefined();
    expect(prefs.surfaceTint).toBe('#112233');
  });
});
