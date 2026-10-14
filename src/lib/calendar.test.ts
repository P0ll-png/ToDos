import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  bucketItemsByDay,
  compareCalendarItems,
  mergeCalendarItems,
  visibleWithOverflow,
} from './calendar';
import type { CalendarItem, EventItem, Task } from './types';

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

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    id: partial.id,
    subjectId: partial.subjectId ?? 'math',
    title: partial.title ?? 'Task',
    notes: '',
    givenDate: '2025-06-01',
    deadline: partial.deadline ?? '2025-06-10T12:00:00Z',
    createdBy: null,
    status: partial.status ?? 'pending',
  };
}

function event(partial: Partial<EventItem> & { id: string }): EventItem {
  return {
    id: partial.id,
    title: partial.title ?? 'Event',
    type: partial.type ?? 'exam',
    subjectId: partial.subjectId ?? 'math',
    eventDate: partial.eventDate ?? '2025-06-12',
    startTime: partial.startTime ?? null,
    endTime: partial.endTime ?? null,
    location: '',
    notes: '',
    createdBy: null,
  };
}

describe('mergeCalendarItems', () => {
  it('normalizes a task onto its deadline date part and marks done from the set', () => {
    const items = mergeCalendarItems(
      [task({ id: 't1', deadline: '2025-06-10T12:00:00Z' })],
      [],
      new Set(['t1']),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'task', id: 't1', done: true });
    // Deadline date part is derived locally — not asserting the exact day here
    // (timezone-dependent), only that it is a non-empty 'YYYY-MM-DD'.
    expect(items[0].datePart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sorts by date, then tasks-before-events, then startTime nulls-last, then title', () => {
    const sorted = mergeCalendarItems(
      [task({ id: 'tLate', deadline: '2025-06-20T09:00:00Z' })],
      [
        event({ id: 'eTimed', eventDate: '2025-06-20', startTime: '08:00:00' }),
        event({ id: 'eDateOnly', eventDate: '2025-06-20', startTime: null, title: 'A' }),
      ],
    );
    // All three fall on (local) 2025-06-20-ish; verify relative order rules by
    // kind + startTime rather than exact day.
    const ids = sorted.map((i) => i.id);
    // A task on the same day sorts before events.
    expect(ids.indexOf('tLate')).toBeLessThan(ids.indexOf('eTimed'));
    // A timed event sorts before a date-only (null) event on the same day.
    expect(ids.indexOf('eTimed')).toBeLessThan(ids.indexOf('eDateOnly'));
  });

  it('undated tasks (empty datePart) sort last', () => {
    const undated: CalendarItem = {
      kind: 'task',
      type: 'pending',
      title: 'z',
      id: 'u',
      datePart: '',
      startTime: null,
    };
    const dated: CalendarItem = {
      kind: 'event',
      type: 'quiz',
      title: 'a',
      id: 'd',
      datePart: '2025-06-01',
      startTime: null,
    };
    expect(compareCalendarItems(undated, dated)).toBeGreaterThan(0);
    expect(compareCalendarItems(dated, undated)).toBeLessThan(0);
  });
});
