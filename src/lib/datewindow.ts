/**
 * datewindow.ts — absence date-range math, pure.
 *
 * Both bounds are date-only 'YYYY-MM-DD' strings compared lexically (zero-
 * padded ISO dates order correctly as strings); nothing here passes a date-
 * only string through `new Date()`.
 */

export interface DateRange {
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
}

/** True iff both bounds are present and `to` is on or after `from`. */
export function isValidRange(from: string, to: string): boolean {
  if (!from || !to) return false;
  return to >= from;
}

/**
 * True iff two inclusive date ranges overlap, including touching at an
 * endpoint. Used by the officer date-range filter. Assumes each range is
 * itself valid (from <= to).
 */
export function rangeOverlaps(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}
