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
 * overdue: pending AND deadline present AND deadline strictly before today.
 * `today` and `deadline` are both zero-padded 'YYYY-MM-DD', so string < works.
 */
export function isOverdue(t: Task, today: string): boolean {
  return t.status === 'pending' && t.deadline != null && t.deadline < today;
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
