/**
 * events.ts — upcoming-assessment detection, pure.
 *
 * Follows the string-date discipline in derive.ts: all comparisons are over
 * 'YYYY-MM-DD' strings (lexical ordering is calendar ordering for zero-padded
 * ISO dates); a Date is used ONLY as calendar arithmetic for addDaysYMD and is
 * never leaked into a comparison.
 */
import type { EventItem } from './types';
import { localTodayISO } from './derive';

/** The event types that count as a graded/assessed obligation. */
const ASSESSMENT_TYPES = new Set(['quiz', 'exam', 'presentation']);

/**
 * Add `n` calendar days to a 'YYYY-MM-DD' string and return a 'YYYY-MM-DD'
 * string. The arithmetic goes through a UTC-midnight Date so DST never shifts
 * the result, and the Date is immediately re-formatted — it never escapes.
 */
export function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * True iff some event belongs to `subjectId`, is an assessment type (quiz,
 * exam or presentation — school_event is excluded), and falls within the
 * inclusive window [today, today+7]. Boundaries: today is included, exactly +7
 * is included, +8 is excluded, and any past date is excluded.
 */
export function hasUpcomingAssessment(
  subjectId: string,
  events: EventItem[],
  today: string = localTodayISO(),
): boolean {
  const horizon = addDaysYMD(today, 7);
  return events.some(
    (e) =>
      e.subjectId === subjectId &&
      ASSESSMENT_TYPES.has(e.type) &&
      e.eventDate >= today &&
      e.eventDate <= horizon,
  );
}
