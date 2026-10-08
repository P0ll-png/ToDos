/**
 * sorting.ts — task sorting, pure.
 *
 * Nearest deadline first; tasks with no deadline sort last. Stable tiebreak by
 * given_date then id. Operates directly on the 'YYYY-MM-DD' strings (never Date)
 * because zero-padded ISO date strings are correctly ordered lexicographically.
 */
import type { Task } from './types';

function tie(a: Task, b: Task): number {
  if (a.givenDate !== b.givenDate) {
    return a.givenDate < b.givenDate ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

/** Returns a new array sorted nearest-deadline-first, undated last. */
export function sortByDeadline(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.deadline && b.deadline) {
      if (a.deadline < b.deadline) return -1;
      if (a.deadline > b.deadline) return 1;
      return tie(a, b);
    }
    if (a.deadline && !b.deadline) return -1; // dated before undated
    if (!a.deadline && b.deadline) return 1;
    return tie(a, b); // both undated
  });
}
