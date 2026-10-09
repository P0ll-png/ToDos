/**
 * derive.ts — glow derivation and overdue detection, pure.
 *
 * Glow is DERIVED from the live tasks array, never stored. Dates are compared
 * as 'YYYY-MM-DD' strings; nothing here passes a date through `new Date()`.
 */
import type { Task } from './types';

/** A subject glows iff it has >= 1 pending task. */
export function subjectHasPending(subjectId: string, tasks: Task[]): boolean {
  return tasks.some((t) => t.subjectId === subjectId && t.status === 'pending');
}

/**
 * overdue: pending AND deadline present AND the deadline instant is strictly
 * before `now`. deadline is an ISO timestamptz string; we compare parsed
 * milliseconds. `now` defaults to the current instant and is injectable for
 * tests. A deadline that fails to parse is treated as not-overdue (defensive).
 */
export function isOverdue(t: Task, now: number = Date.now()): boolean {
  if (t.status !== 'pending' || t.deadline == null) return false;
  const ms = Date.parse(t.deadline);
  if (Number.isNaN(ms)) return false;
  return ms < now;
}

/**
 * Format an ISO timestamptz deadline for display in the viewer's local zone,
 * e.g. 'Oct 8, 2026, 2:30 PM'. Returns '' for null/unparseable input.
 */
export function formatDeadline(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Combine a 'YYYY-MM-DD' date and an 'HH:MM' time (both viewer-local) into an
 * ISO timestamptz string for storage. If time is empty, defaults to end of day
 * (23:59) so a date-only deadline means "due by end of that day". Returns null
 * when the date is empty.
 */
export function toDeadlineISO(dateYMD: string, timeHM: string): string | null {
  if (!dateYMD) return null;
  const [y, m, d] = dateYMD.split('-').map(Number);
  let hours = 23;
  let minutes = 59;
  if (timeHM) {
    const [h, min] = timeHM.split(':').map(Number);
    if (!Number.isNaN(h)) hours = h;
    if (!Number.isNaN(min)) minutes = min;
  }
  // Construct in LOCAL time, then serialize to an absolute ISO instant.
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hours, minutes, 0, 0);
  return dt.toISOString();
}

/** Extract the local 'YYYY-MM-DD' date part from an ISO deadline (or ''). */
export function deadlineDatePart(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return localTodayISO(new Date(ms));
}

/** Extract the local 'HH:MM' time part from an ISO deadline (or ''). */
export function deadlineTimePart(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

/**
 * The viewer's LOCAL calendar date as a zero-padded 'YYYY-MM-DD' string.
 *
 * MUST use local getters (getFullYear/getMonth/getDate) and MUST +1 the 0-based
 * month and zero-pad month/day. Do NOT use toISOString() — it is UTC and would
 * shift the day across midnight, silently breaking the overdue string compare.
 */
export function localTodayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
