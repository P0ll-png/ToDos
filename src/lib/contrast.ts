/**
 * contrast.ts — thin re-exports of the WCAG contrast functions from theme-core.
 * Exists for test discoverability (tests import contrast math from here) and to
 * give components/panels a focused import surface for AA checks.
 */
export {
  hexToRgb,
  rgbToHex,
  relativeLuminance,
  lum,
  contrastRatio,
  pickReadable,
  adjustForAA,
  isHex,
  AA_NORMAL,
} from './theme-core';
export type { Rgb } from './theme-core';
