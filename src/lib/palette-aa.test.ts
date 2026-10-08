/**
 * palette-aa.test.ts — computational WCAG AA assertions over the SHIPPED default
 * palettes (acceptance criterion 5) and the fix-#5 behavior of resolveAccentText
 * (--accent-text is computed ONCE against BOTH --bg and --surface, falling back
 * to --text when neither passes). These guard the defaults and the contrast
 * guard rather than any user-only edge case.
 */
import { describe, it, expect } from 'vitest';
import {
  AA_NORMAL,
  DARK_BASE,
  LIGHT_BASE,
  DEFAULT_ACCENT,
  contrastRatio,
  resolveAccentText,
  resolveTokens,
  DEFAULT_PREFS,
  type BasePalette,
  type ResolvedMode,
} from './theme-core';

const cases: Array<{ mode: ResolvedMode; base: BasePalette }> = [
  { mode: 'dark', base: DARK_BASE },
  { mode: 'light', base: LIGHT_BASE },
];

describe('default palettes meet WCAG AA (criterion 5)', () => {
  for (const { mode, base } of cases) {
    it(`${mode}: --text clears AA on --bg and --surface`, () => {
      expect(contrastRatio(base.text, base.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(base.text, base.surface)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });

    it(`${mode}: --muted clears AA on --bg and --surface`, () => {
      expect(contrastRatio(base.muted, base.bg)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(contrastRatio(base.muted, base.surface)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });

    it(`${mode}: --danger-contrast clears AA on --danger`, () => {
      expect(
        contrastRatio(base.dangerContrast, base.danger),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it(`${mode}: resolved default --accent-text is AA on both bg and surface, or is --text`, () => {
      const tokens = resolveTokens(DEFAULT_PREFS, mode);
      const t = tokens['--accent-text'];
      const okBoth =
        contrastRatio(t, tokens['--bg']) >= AA_NORMAL &&
        contrastRatio(t, tokens['--surface']) >= AA_NORMAL;
      expect(okBoth || t === tokens['--text']).toBe(true);
    });
  }
});

describe('resolveAccentText (fix #5)', () => {
  it('computes a single value readable on BOTH bg and surface when possible', () => {
    // Dark mode: lighten the amber until it clears AA on both navy bg/surface.
    const value = resolveAccentText(
      DEFAULT_ACCENT,
      DARK_BASE.bg,
      DARK_BASE.surface,
      DARK_BASE.text,
      'dark',
    );
    expect(contrastRatio(value, DARK_BASE.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(value, DARK_BASE.surface)).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it('falls back to --text when no accent-derived color clears AA on both', () => {
    // A pure-white accent in dark mode can only lighten (stays white) and never
    // clears AA on a near-white surface -> must fall back to the base text.
    const text = '#E8EDF5';
    const value = resolveAccentText('#FFFFFF', '#FFFFFF', '#FFFFFF', text, 'dark');
    expect(value).toBe(text);
  });

  it('keeps the user accent fill (--accent) even when --accent-text falls back', () => {
    const prefs = { ...DEFAULT_PREFS, accent: '#FFFFFF' };
    // White tints in DARK mode: adjustForAA only LIGHTENS, so a white accent
    // stays white and can never clear AA on the white bg/surface -> fall back.
    const tokens = resolveTokens(
      { ...prefs, bgTint: '#FFFFFF', surfaceTint: '#FFFFFF' },
      'dark',
    );
    expect(tokens['--accent']).toBe('#FFFFFF');
    expect(tokens['--accent-text']).toBe(tokens['--text']);
  });
});
