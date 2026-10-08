/**
 * theme-core.ts — the dependency-free pure core of the theme system.
 *
 * HARD CONSTRAINT: this module must import NOTHING from React, Supabase, or any
 * browser global (window/document/localStorage/matchMedia) at module scope. It
 * is bundled standalone by esbuild (bundle:true, format:iife) to produce the
 * pre-paint theme bootstrap injected into index.html. Keeping it pure also makes
 * every function here directly unit-testable without mocks.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';

export interface ThemePrefs {
  mode: ThemeMode;
  /** accent hex #RRGGBB */
  accent: string;
  /** optional background tint hex #RRGGBB — replaces --bg for the active mode */
  bgTint?: string;
  /** optional surface (card) tint hex #RRGGBB — replaces --surface for the active mode */
  surfaceTint?: string;
}

export const DEFAULT_ACCENT = '#FFB547';

export const DEFAULT_PREFS: ThemePrefs = {
  mode: 'system',
  accent: DEFAULT_ACCENT,
};

/** Shared, non-mode-specific tokens. */
const RADIUS = '12px';
const FONT_SANS =
  "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Base palette per mode. The user's accent is overlaid on top of either of
 * these; switching mode keeps the accent and only swaps the base.
 * --danger / --danger-contrast are fixed per mode and NOT user-themable so
 * overdue flags always stay legible.
 */
export interface BasePalette {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  danger: string;
  dangerContrast: string;
}

export const DARK_BASE: BasePalette = {
  bg: '#0E1726',
  surface: '#15223A',
  border: '#24344F',
  text: '#E8EDF5',
  muted: '#9AA8BF',
  danger: '#F0666B',
  dangerContrast: '#1A0A0B',
};

export const LIGHT_BASE: BasePalette = {
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  border: '#D5DCE8',
  text: '#141C2B',
  muted: '#5B6881',
  danger: '#C62F36',
  dangerContrast: '#FFFFFF',
};

export function basePalette(mode: ResolvedMode): BasePalette {
  return mode === 'dark' ? DARK_BASE : LIGHT_BASE;
}

// ============ color math ============

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function isHex(value: string): boolean {
  return HEX_RE.test(value);
}

export function hexToRgb(hex: string): Rgb {
  const m = HEX_RE.exec(hex);
  if (!m) {
    // Defensive: callers validate, but never throw at module boundaries.
    return { r: 0, g: 0, b: 0 };
  }
  const int = parseInt(m[1], 16);
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** luminance from a hex string — single consistent helper. */
export function lum(hex: string): number {
  return relativeLuminance(hexToRgb(hex));
}

/** WCAG contrast ratio, always >= 1. */
export function contrastRatio(a: string, b: string): number {
  const [L1, L2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}

/** Choose black or white text to sit on `bg` — the one with the higher ratio. */
export function pickReadable(bg: string): '#000000' | '#FFFFFF' {
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#000000')
    ? '#FFFFFF'
    : '#000000';
}

export const AA_NORMAL = 4.5;

// ============ HSL helpers (for lightness stepping in adjustForAA) ============

export interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = clamp255(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  return {
    r: clamp255(hue2rgb(p, q, hk + 1 / 3) * 255),
    g: clamp255(hue2rgb(p, q, hk) * 255),
    b: clamp255(hue2rgb(p, q, hk - 1 / 3) * 255),
  };
}

/** accent at the given alpha as an rgba() string (for the glow halo / weak tints). */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * adjustForAA — compute a readable foreground color derived from `accent` for
 * use as text ON `surface`. Pure, total, bounded (<= 50 iterations).
 *
 * 1. If accent already clears AA against surface, return it unchanged.
 * 2. Otherwise step lightness toward the readable end — DARKEN in light mode,
 *    LIGHTEN in dark mode — by 2 percentage points of L per iteration.
 * 3. The first candidate >= 4.5:1 wins.
 * 4. If 50 steps are exhausted without clearing AA, return null so the caller
 *    can fall back to --text (we deliberately do not desaturate — preserving
 *    hue is less surprising than silently changing color).
 */
export function adjustForAA(
  accent: string,
  surface: string,
  mode: ResolvedMode,
): string | null {
  if (contrastRatio(accent, surface) >= AA_NORMAL) {
    return accent;
  }
  const hsl = rgbToHsl(hexToRgb(accent));
  const stepL = 0.02;
  const dir = mode === 'light' ? -1 : 1; // darken in light, lighten in dark
  let l = hsl.l;
  for (let i = 0; i < 50; i++) {
    l += dir * stepL;
    if (l < 0) l = 0;
    if (l > 1) l = 1;
    const candidate = rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l }));
    if (contrastRatio(candidate, surface) >= AA_NORMAL) {
      return candidate;
    }
    if (l <= 0 || l >= 1) break; // can't push lightness any further
  }
  return null;
}

/**
 * Compute --accent-text ONCE by running adjustForAA against BOTH --bg and
 * --surface and keeping the result that satisfies AA against both. If neither
 * passes, fall back to the base text color. Links appear on cards (--surface)
 * and sometimes directly on --bg, so the resolved value must clear both.
 */
export function resolveAccentText(
  accent: string,
  bg: string,
  surface: string,
  text: string,
  mode: ResolvedMode,
): string {
  const onSurface = adjustForAA(accent, surface, mode);
  const onBg = adjustForAA(accent, bg, mode);
  if (
    onSurface != null &&
    onBg != null &&
    contrastRatio(onSurface, bg) >= AA_NORMAL &&
    contrastRatio(onSurface, surface) >= AA_NORMAL
  ) {
    return onSurface;
  }
  if (
    onSurface != null &&
    onBg != null &&
    contrastRatio(onBg, bg) >= AA_NORMAL &&
    contrastRatio(onBg, surface) >= AA_NORMAL
  ) {
    return onBg;
  }
  // Try the darker/lighter of the two candidates that clears both, if any.
  for (const cand of [onSurface, onBg]) {
    if (
      cand != null &&
      contrastRatio(cand, bg) >= AA_NORMAL &&
      contrastRatio(cand, surface) >= AA_NORMAL
    ) {
      return cand;
    }
  }
  return text;
}

// ============ token resolution ============

export type TokenMap = Record<string, string>;

/**
 * resolveTokens — produce the full CSS custom-property map for the given prefs
 * and already-resolved mode (never 'system'; the caller resolves system first).
 * Pure. Used by both the runtime ThemeProvider and the pre-paint bootstrap.
 */
export function resolveTokens(prefs: ThemePrefs, resolvedMode: ResolvedMode): TokenMap {
  const base = basePalette(resolvedMode);

  const accent = prefs.accent && isHex(prefs.accent) ? prefs.accent : DEFAULT_ACCENT;
  const bg = prefs.bgTint && isHex(prefs.bgTint) ? prefs.bgTint : base.bg;
  const surface =
    prefs.surfaceTint && isHex(prefs.surfaceTint) ? prefs.surfaceTint : base.surface;

  // --surface-2: a mode-aware lighten (light) / darken (dark) of --surface.
  const surfaceHsl = rgbToHsl(hexToRgb(surface));
  const delta = 0.05;
  const surface2L =
    resolvedMode === 'dark'
      ? Math.min(1, surfaceHsl.l + delta)
      : Math.max(0, surfaceHsl.l - delta);
  const surface2 = rgbToHex(
    hslToRgb({ h: surfaceHsl.h, s: surfaceHsl.s, l: surface2L }),
  );

  const accentContrast = pickReadable(accent);
  const accentText = resolveAccentText(accent, bg, surface, base.text, resolvedMode);
  const accentWeak = withAlpha(accent, 0.22);

  return {
    '--bg': bg,
    '--surface': surface,
    '--surface-2': surface2,
    '--border': base.border,
    '--text': base.text,
    '--muted': base.muted,
    '--accent': accent,
    '--accent-contrast': accentContrast,
    '--accent-text': accentText,
    '--accent-weak': accentWeak,
    '--focus-ring': accentText,
    '--danger': base.danger,
    '--danger-contrast': base.dangerContrast,
    '--dot-ring': base.text,
    '--radius': RADIUS,
    '--font-sans': FONT_SANS,
  };
}

/** Resolve a stored mode preference ('system') to a concrete light/dark value. */
export function resolveMode(mode: ThemeMode, prefersDark: boolean): ResolvedMode {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/**
 * Defensive parse of a stored prefs blob (from localStorage or the DB). Unknown
 * or malformed input never throws — it falls back to DEFAULT_PREFS fields.
 */
export function normalizePrefs(input: unknown): ThemePrefs {
  if (input == null || typeof input !== 'object') {
    return { ...DEFAULT_PREFS };
  }
  const obj = input as Record<string, unknown>;
  const mode: ThemeMode =
    obj.mode === 'light' || obj.mode === 'dark' || obj.mode === 'system'
      ? obj.mode
      : DEFAULT_PREFS.mode;
  const accent =
    typeof obj.accent === 'string' && isHex(obj.accent)
      ? obj.accent
      : DEFAULT_ACCENT;
  const prefs: ThemePrefs = { mode, accent };
  if (typeof obj.bgTint === 'string' && isHex(obj.bgTint)) {
    prefs.bgTint = obj.bgTint;
  }
  if (typeof obj.surfaceTint === 'string' && isHex(obj.surfaceTint)) {
    prefs.surfaceTint = obj.surfaceTint;
  }
  return prefs;
}
