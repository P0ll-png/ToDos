import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import esbuild from 'esbuild';

const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * The runtime bootstrap stub. It is appended AFTER the bundled theme-core IIFE
 * (exposed as the global `CBTheme`). It reads localStorage 'cb-theme', resolves
 * 'system' via matchMedia, writes data-mode + the resolved tokens on <html>
 * before first paint, and falls back to default dark on any error.
 *
 * Kept as a string (not Function.prototype.toString) so it never depends on
 * build-time scope.
 */
const BOOTSTRAP_STUB = `
(function () {
  try {
    var raw = null;
    try { raw = window.localStorage.getItem('cb-theme'); } catch (e) {}
    var prefs = CBTheme.DEFAULT_PREFS;
    if (raw) {
      try { prefs = CBTheme.normalizePrefs(JSON.parse(raw)); } catch (e) {}
    }
    var prefersDark = false;
    try {
      prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {}
    var mode = CBTheme.resolveMode(prefs.mode, prefersDark);
    var el = document.documentElement;
    el.setAttribute('data-mode', mode);
    var tokens = CBTheme.resolveTokens(prefs, mode);
    for (var key in tokens) {
      if (Object.prototype.hasOwnProperty.call(tokens, key)) {
        el.style.setProperty(key, tokens[key]);
      }
    }
  } catch (e) {
    try { document.documentElement.setAttribute('data-mode', 'dark'); } catch (e2) {}
  }
})();
`;

/** Marker comment left in index.html <head> so the bootstrap is placed there. */
async function buildThemeIife(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [resolve(rootDir, 'src/lib/theme-core.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'CBTheme',
    minify: true,
    write: false,
    platform: 'browser',
    target: 'es2018',
  });
  return result.outputFiles[0].text;
}

/**
 * Vite plugin: inject the pre-paint theme bootstrap into <head> BEFORE the app
 * bundle. The entire theme-core dependency graph is captured by esbuild
 * (bundle:true) into one self-contained IIFE exposing CBTheme.*; a tiny inline
 * stub then calls it. This runs before paint, so there is no flash of the wrong
 * theme.
 */
function themeBootstrapPlugin(): Plugin {
  return {
    name: 'classboard-theme-bootstrap',
    async transformIndexHtml(html) {
      const iife = await buildThemeIife();
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: { type: 'text/javascript' },
            children: `${iife}\n${BOOTSTRAP_STUB}`,
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), themeBootstrapPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
