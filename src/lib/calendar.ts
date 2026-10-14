/**
 * calendar.ts — month-grid construction and item bucketing, pure.
 *
 * All date keys are 'YYYY-MM-DD' strings. The grid is always 6 rows x 7
 * columns (42 cells), Monday-first, so Saturday and Sunday are always present
 * (a 7-column Monday-first week necessarily ends on Sunday).
 */
import type { CalendarItem, MonthCell } from './types';

function ymd(y: number, m0: number, day: number): string {
  const mm = String(m0 + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/**
 * Build a 42-cell (6x7) Monday-first month grid for the given year and 0-based
 * month. Leading cells come from the previous month and trailing cells from
 * the next, both flagged inMonth=false. isToday is set on the cell matching
 * `today` ('YYYY-MM-DD').
 */
export function buildMonthGrid(
  year: number,
  month0: number,
  today: string,
): MonthCell[] {
  // JS getDay(): 0=Sun..6=Sat. Convert to Monday-first index 0=Mon..6=Sun.
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const leading = (firstDow + 6) % 7;

  const cells: MonthCell[] = [];
  // Start from `leading` days before the 1st of the month.
  const start = new Date(Date.UTC(year, month0, 1 - leading));
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const dateYMD = ymd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    cells.push({
      dateYMD,
      inMonth: d.getUTCMonth() === month0 && d.getUTCFullYear() === year,
      isToday: dateYMD === today,
    });
  }
  return cells;
}

/**
 * Group items into day buckets keyed by 'YYYY-MM-DD'. A task is placed on its
 * deadline date part and an event on its date — both already normalized into
 * CalendarItem.datePart by the caller. Items whose datePart is not among the
 * grid's cells are dropped (they fall outside the visible month window).
 */
export function bucketItemsByDay(
  cells: MonthCell[],
  items: CalendarItem[],
): Map<string, CalendarItem[]> {
  const buckets = new Map<string, CalendarItem[]>();
  for (const cell of cells) {
    buckets.set(cell.dateYMD, []);
  }
  for (const item of items) {
    const bucket = buckets.get(item.datePart);
    if (bucket) bucket.push(item);
  }
  return buckets;
}

/**
 * Return the first `max` items plus the count of any beyond that, for the
 * "+N more" indicator. Exactly `max` items show all of them (moreCount 0);
 * `max + 1` shows `max` plus moreCount 1.
 */
export function visibleWithOverflow(
  items: CalendarItem[],
  max = 3,
): { shown: CalendarItem[]; moreCount: number } {
  return {
    shown: items.slice(0, max),
    moreCount: Math.max(0, items.length - max),
  };
}
