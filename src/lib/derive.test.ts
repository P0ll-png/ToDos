import { describe, it, expect } from 'vitest';
import { subjectHasPending, isOverdue, localTodayISO } from './derive';
import type { Task } from './types';

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    subjectId: 's1',
    title: 't',
    notes: '',
    givenDate: '2025-01-01',
    deadline: null,
    createdBy: null,
    status: 'pending',
    ...partial,
  };
}

describe('subjectHasPending', () => {
  it('is true when at least one pending task matches the subject', () => {
    const tasks = [
      task({ id: '1', subjectId: 'math', status: 'pending' }),
      task({ id: '2', subjectId: 'math', status: 'done' }),
    ];
    expect(subjectHasPending('math', tasks)).toBe(true);
  });

  it('is false when all matching tasks are done', () => {
    const tasks = [task({ id: '1', subjectId: 'math', status: 'done' })];
    expect(subjectHasPending('math', tasks)).toBe(false);
  });

  it('is false when no tasks match the subject', () => {
    const tasks = [task({ id: '1', subjectId: 'sci', status: 'pending' })];
    expect(subjectHasPending('math', tasks)).toBe(false);
  });
});

describe('isOverdue', () => {
  const today = '2025-06-15';

  it('is false for a same-day deadline', () => {
    expect(isOverdue(task({ id: '1', deadline: '2025-06-15' }), today)).toBe(
      false,
    );
  });

  it('is true for a one-day-past deadline when pending', () => {
    expect(isOverdue(task({ id: '1', deadline: '2025-06-14' }), today)).toBe(
      true,
    );
  });

  it('is false when the past-deadline task is done', () => {
    expect(
      isOverdue(task({ id: '1', deadline: '2025-06-14', status: 'done' }), today),
    ).toBe(false);
  });

  it('is false when there is no deadline', () => {
    expect(isOverdue(task({ id: '1', deadline: null }), today)).toBe(false);
  });
});

describe('localTodayISO', () => {
  it('zero-pads single-digit month and day and +1s the month', () => {
    // Jan 3 2025 — month index 0 must become "01", day "03"
    expect(localTodayISO(new Date(2025, 0, 3))).toBe('2025-01-03');
  });

  it('formats a double-digit month and day', () => {
    expect(localTodayISO(new Date(2025, 11, 25))).toBe('2025-12-25');
  });

  it('uses the LOCAL date, not the UTC date, near midnight', () => {
    const d = new Date(2025, 5, 15, 1, 0, 0); // local 01:00 on Jun 15
    expect(localTodayISO(d)).toBe('2025-06-15');
    expect(localTodayISO(d)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`,
    );
  });
});
