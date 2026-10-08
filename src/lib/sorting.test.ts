import { describe, it, expect } from 'vitest';
import { sortByDeadline } from './sorting';
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

describe('sortByDeadline', () => {
  it('orders nearest deadline first', () => {
    const result = sortByDeadline([
      task({ id: 'b', deadline: '2025-03-10' }),
      task({ id: 'a', deadline: '2025-01-05' }),
      task({ id: 'c', deadline: '2025-02-01' }),
    ]);
    expect(result.map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });

  it('places undated tasks last', () => {
    const result = sortByDeadline([
      task({ id: 'none', deadline: null }),
      task({ id: 'dated', deadline: '2025-05-01' }),
    ]);
    expect(result.map((t) => t.id)).toEqual(['dated', 'none']);
  });

  it('tiebreaks equal deadlines by given_date then id', () => {
    const result = sortByDeadline([
      task({ id: 'z', deadline: '2025-02-02', givenDate: '2025-01-02' }),
      task({ id: 'a', deadline: '2025-02-02', givenDate: '2025-01-02' }),
      task({ id: 'm', deadline: '2025-02-02', givenDate: '2025-01-01' }),
    ]);
    expect(result.map((t) => t.id)).toEqual(['m', 'a', 'z']);
  });

  it('does not mutate the input array', () => {
    const input = [
      task({ id: 'b', deadline: '2025-03-10' }),
      task({ id: 'a', deadline: '2025-01-05' }),
    ];
    const copy = [...input];
    sortByDeadline(input);
    expect(input).toEqual(copy);
  });
});
