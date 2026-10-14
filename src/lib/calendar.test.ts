import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  bucketItemsByDay,
  visibleWithOverflow,
} from './calendar';
import type { CalendarItem } from './types';

function item(partial: Partial<CalendarItem> & { id: string }): CalendarItem {
  return {
    kind: 'event',
    type: 'quiz',
    title: 't',
    datePart: '2025-06-15',
    startTime: null,
    ...partial,
  };
}

describe('buildMonthGrid', () => {
  it('always returns 42 cells', () => {
    expect(buildMonthGrid(2025, 5, '2025-06-15')).toHaveLength(42);
  });

  it('is Monday-first: a month starting on a Sunday has 6 leading days', () => {
    // June 2025 starts on Sunday (2025-06-01 is a Sunday).
    const cells = buildMonthGrid(2025, 5, '2025-06-15');
    expect(cells[0].dateYMD).toBe('2025-05-26'); // the Monday before
    expect(cells[0].inMonth).toBe(false);
    expect(cells[6].dateYMD).toBe('2025-06-01'); // Sunday ends week 1
    expect(cells[6].inMonth).toBe(true);
  });

  it('has zero leading days when the month starts on a Monday', () => {
    // September 2025 starts on Monday (2025-09-01 is a Monday).
    const cells = buildMonthGrid(2025, 8, '2025-09-15');
    expect(cells[0].dateYMD).toBe('2025-09-01');
    expect(cells[0].inMonth).toBe(true);
  });

  it('flags trailing adjacent-month days as inMonth=false', () => {
    const cells = buildMonthGrid(2025, 5, '2025-06-15');
    const last = cells[41];
    expect(last.inMonth).toBe(false);
    expect(last.dateYMD.startsWith('2025-07')).toBe(true);
  });

  it('detects isToday on the matching in-month cell', () => {
    const cells = buildMonthGrid(2025, 5, '2025-06-15');
    const today = cells.filter((c) => c.isToday);
    expect(today).toHaveLength(1);
    expect(today[0].dateYMD).toBe('2025-06-15');
  });
});

describe('bucketItemsByDay', () => {
  const cells = buildMonthGrid(2025, 5, '2025-06-15');

  it('places a task on its deadline date part and an event on its date', () => {
    const items = [
      item({ id: 'task-1', kind: 'task', datePart: '2025-06-10' }),
      item({ id: 'ev-1', kind: 'event', datePart: '2025-06-10' }),
      item({ id: 'ev-2', kind: 'event', datePart: '2025-06-20' }),
    ];
    const buckets = bucketItemsByDay(cells, items);
    expect(buckets.get('2025-06-10')?.map((i) => i.id)).toEqual([
      'task-1',
      'ev-1',
    ]);
    expect(buckets.get('2025-06-20')?.map((i) => i.id)).toEqual(['ev-2']);
  });

  it('drops items outside the grid window', () => {
    const items = [item({ id: 'x', datePart: '2030-01-01' })];
    const buckets = bucketItemsByDay(cells, items);
    const total = [...buckets.values()].reduce((n, b) => n + b.length, 0);
    expect(total).toBe(0);
  });
});

describe('visibleWithOverflow', () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => item({ id: String(i) }));

  it('shows all when there are 0 items', () => {
    const { shown, moreCount } = visibleWithOverflow([]);
    expect(shown).toHaveLength(0);
    expect(moreCount).toBe(0);
  });

  it('shows all three with no overflow at exactly 3', () => {
    const { shown, moreCount } = visibleWithOverflow(make(3));
    expect(shown).toHaveLength(3);
    expect(moreCount).toBe(0);
  });

  it('shows three plus moreCount 1 at exactly 4', () => {
    const { shown, moreCount } = visibleWithOverflow(make(4));
    expect(shown).toHaveLength(3);
    expect(moreCount).toBe(1);
  });
});
