// @vitest-environment node
// esbuild's startup invariant (new TextEncoder().encode("") instanceof
// Uint8Array) fails under jsdom's cross-realm typed arrays, so this suite runs
// in the Node environment where esbuild can start.
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import esbuild from 'esbuild';
import {
  resolveTokens,
  type ThemePrefs,
  type ResolvedMode,
} from './theme-core';

/**
 * Parity test: build the SAME esbuild IIFE the Vite plugin injects, eval it in a
 * fresh VM context to obtain the inlined CBTheme.resolveTokens, and assert it
 * returns token maps byte-identical to the directly-imported runtime
 * resolveTokens. Evaluating the real bundle also catches a parse-time throw or
 * dangling-identifier regression that would make the inline script silently
 * fall back to default dark.
 */
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface CBTheme {
  resolveTokens: (prefs: ThemePrefs, mode: ResolvedMode) => Record<string, string>;
  DEFAULT_PREFS: ThemePrefs;
}

let inlined: CBTheme;

beforeAll(async () => {
  const built = await esbuild.build({
    entryPoints: [resolve(rootDir, 'src/lib/theme-core.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'CBTheme',
    minify: true,
    write: false,
    platform: 'browser',
    target: 'es2018',
  });
  const iife = built.outputFiles[0].text;
  const sandbox: { CBTheme?: CBTheme } = {};
  runInNewContext(iife, sandbox);
  if (!sandbox.CBTheme) {
    throw new Error('Inline bundle did not expose CBTheme');
  }
  inlined = sandbox.CBTheme;
});

describe('inline bootstrap parity', () => {
  const cases: Array<{ name: string; prefs: ThemePrefs; mode: ResolvedMode }> = [
    { name: 'default dark', prefs: { mode: 'system', accent: '#FFB547' }, mode: 'dark' },
    { name: 'default light', prefs: { mode: 'system', accent: '#FFB547' }, mode: 'light' },
    { name: 'custom accent', prefs: { mode: 'dark', accent: '#3366FF' }, mode: 'dark' },
    {
      name: 'light tint',
      prefs: { mode: 'light', accent: '#CC0044', bgTint: '#FAFAFA', surfaceTint: '#FFFFFF' },
      mode: 'light',
    },
  ];

  it('exposes resolveTokens on the inlined global', () => {
    expect(typeof inlined.resolveTokens).toBe('function');
  });

  for (const c of cases) {
    it(`matches runtime resolveTokens: ${c.name}`, () => {
      const fromRuntime = resolveTokens(c.prefs, c.mode);
      const fromInline = inlined.resolveTokens(c.prefs, c.mode);
      expect(fromInline).toEqual(fromRuntime);
    });
  }
});
