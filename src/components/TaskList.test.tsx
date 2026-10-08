import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock('../context/SessionProvider', () => ({
  useSession: () => useSessionMock(),
}));

// Mutations are not exercised here; mock them so the module graph stays pure.
vi.mock('../data/mutations', () => ({
  MUTATION_MESSAGES: { 'not-configured': '', denied: '', network: '' },
  addTask: vi.fn(),
  removeTask: vi.fn(),
  setTaskStatus: vi.fn(),
}));

import { TaskList } from './TaskList';
import type { Subject, Task } from '../lib/types';

const subjects: Subject[] = [
  { id: 'math', name: 'Mathematics', room: 'Room 1', color: null },
];

const tasks: Task[] = [
  {
    id: 't1',
    subjectId: 'math',
    title: 'Chapter 3 exercises',
    notes: '',
    givenDate: '2025-06-01',
    deadline: '2025-06-10',
    createdBy: null,
    status: 'pending',
  },
];

function sessionFor(role: 'officer' | 'member' | null) {
  return {
    session: role ? {} : null,
    profile: role ? { id: 'u', name: 'U', email: 'u@x.com', role } : null,
    role,
    isOfficer: role === 'officer',
    refreshProfile: vi.fn(),
  };
}

describe('TaskList officer-only controls', () => {
  beforeEach(() => useSessionMock.mockReset());

  it('shows Add task, Remove and status toggle for an officer', () => {
    useSessionMock.mockReturnValue(sessionFor('officer'));
    render(<TaskList subjects={subjects} tasks={tasks} />);
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Remove Mathematics - Chapter 3/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument();
  });

  it('hides all officer controls for a member', () => {
    useSessionMock.mockReturnValue(sessionFor('member'));
    render(<TaskList subjects={subjects} tasks={tasks} />);
    expect(
      screen.queryByRole('button', { name: 'Add task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remove/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark done' }),
    ).not.toBeInTheDocument();
    // The task itself is still visible to everyone.
    expect(
      screen.getByText('Mathematics - Chapter 3 exercises'),
    ).toBeInTheDocument();
  });

  it('hides all officer controls for an anonymous visitor', () => {
    useSessionMock.mockReturnValue(sessionFor(null));
    render(<TaskList subjects={subjects} tasks={tasks} />);
    expect(
      screen.queryByRole('button', { name: 'Add task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remove/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark done' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Mathematics - Chapter 3 exercises'),
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no tasks', () => {
    useSessionMock.mockReturnValue(sessionFor('officer'));
    render(<TaskList subjects={subjects} tasks={[]} />);
    expect(screen.getByText('No tasks yet.')).toBeInTheDocument();
  });
});
