/**
 * palette-ext-aa.test.ts — computational WCAG AA assertions over the NEW fixed
 * per-mode chip/badge tokens added to src/styles/tokens.css (event types,
 * absence status, assessment marker) and the --task-done dim text.
 *
 * These tokens are NOT resolved through theme-core.ts (they behave like
 * --danger), so this harness imports ONLY the pure contrast primitives and
 * asserts over a literal hex table that MUST stay identical to tokens.css. If a
 * pair fails, nudge the hex in BOTH this table and tokens.css until green.
 */
import { describe, it, expect } from 'vitest';
import { contrastRatio, AA_NORMAL } from './theme-core';

type Mode = 'dark' | 'light';

// --- surface/bg per mode (mirrors tokens.css, for the --task-done check) ---
const SURFACE: Record<Mode, { bg: string; surface: string }> = {
  dark: { bg: '#0E1726', surface: '#15223A' },
  light: { bg: '#F5F7FB', surface: '#FFFFFF' },
};

// --- chip/badge background + its own foreground (mirrors tokens.css) ---
const PAIRS: Array<{ mode: Mode; token: string; bg: string; fg: string }> = [
  // dark mode
  { mode: 'dark', token: '--ev-school', bg: '#8FB4FF', fg: '#0E1726' },
  { mode: 'dark', token: '--ev-quiz', bg: '#6FE3C0', fg: '#0E1726' },
  { mode: 'dark', token: '--ev-exam', bg: '#FF9AA0', fg: '#1A0A0B' },
  { mode: 'dark', token: '--ev-pres', bg: '#D3A6F2', fg: '#0E1726' },
  { mode: 'dark', token: '--status-pending', bg: '#FFD08A', fg: '#0E1726' },
  { mode: 'dark', token: '--status-ack', bg: '#6FE3C0', fg: '#0E1726' },
  { mode: 'dark', token: '--status-followup', bg: '#FF9AA0', fg: '#1A0A0B' },
  { mode: 'dark', token: '--assess-badge', bg: '#FF9AA0', fg: '#1A0A0B' },
  // light mode
  { mode: 'light', token: '--ev-school', bg: '#2563EB', fg: '#FFFFFF' },
  { mode: 'light', token: '--ev-quiz', bg: '#0E7A5F', fg: '#FFFFFF' },
  { mode: 'light', token: '--ev-exam', bg: '#B4232A', fg: '#FFFFFF' },
  { mode: 'light', token: '--ev-pres', bg: '#7A3DB8', fg: '#FFFFFF' },
  { mode: 'light', token: '--status-pending', bg: '#8A5A00', fg: '#FFFFFF' },
  { mode: 'light', token: '--status-ack', bg: '#0E7A5F', fg: '#FFFFFF' },
  { mode: 'light', token: '--status-followup', bg: '#B4232A', fg: '#FFFFFF' },
  { mode: 'light', token: '--assess-badge', bg: '#B4232A', fg: '#FFFFFF' },
];

// --- --task-done is readable dim text, not decoration (mirrors tokens.css) ---
const TASK_DONE: Record<Mode, string> = {
  dark: '#9AA8BF',
  light: '#5B6881',
};

describe('new chip/badge tokens meet WCAG AA (fg on own bg)', () => {
  for (const { mode, token, bg, fg } of PAIRS) {
    it(`${mode} ${token}-fg clears AA on ${token}`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }
});

describe('--task-done is readable on --surface and --bg', () => {
  for (const mode of ['dark', 'light'] as Mode[]) {
    it(`${mode}: --task-done clears AA on --surface and --bg`, () => {
      const fg = TASK_DONE[mode];
      expect(contrastRatio(fg, SURFACE[mode].surface)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(contrastRatio(fg, SURFACE[mode].bg)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });
  }
});
