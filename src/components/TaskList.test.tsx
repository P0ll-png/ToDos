import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock('../context/SessionProvider', () => ({
  useSession: () => useSessionMock(),
}));

// Mutations are not exercised here (except that handlers reference them); mock
// them so the module graph stays pure.
vi.mock('../data/mutations', () => ({
  MUTATION_MESSAGES: { 'not-configured': '', denied: '', network: '' },
  addTask: vi.fn(),
  removeTask: vi.fn(),
  setTaskStatus: vi.fn(),
  addEvent: vi.fn(),
  removeEvent: vi.fn(),
  markTaskDone: vi.fn(),
  unmarkTaskDone: vi.fn(),
}));

import { TaskList } from './TaskList';
import type { EventItem, Subject, Task } from '../lib/types';

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

const events: EventItem[] = [
  {
    id: 'e1',
    title: 'Midterm exam',
    type: 'exam',
    subjectId: 'math',
    eventDate: '2025-06-12',
    startTime: '09:00:00',
    endTime: '10:30:00',
    location: 'Hall A',
    notes: '',
    createdBy: null,
  },
];

function sessionFor(role: 'officer' | 'member' | null) {
  return {
    session: role ? { user: { id: 'u', email: 'u@x.com' } } : null,
    profile: role ? { id: 'u', name: 'U', email: 'u@x.com', role } : null,
    role,
    isOfficer: role === 'officer',
    refreshProfile: vi.fn(),
  };
}

const noop = () => {};

function renderList(
  role: 'officer' | 'member' | null,
  overrides: Partial<React.ComponentProps<typeof TaskList>> = {},
) {
  useSessionMock.mockReturnValue(sessionFor(role));
  return render(
    <TaskList
      subjects={subjects}
      tasks={tasks}
      events={events}
      completedTaskIds={new Set()}
      onAddLocalCompletion={noop}
      onRemoveLocalCompletion={noop}
      {...overrides}
    />,
  );
}

describe('TaskList officer-only controls', () => {
  beforeEach(() => useSessionMock.mockReset());

  it('shows Add task, Add Event, Remove and status toggle for an officer', () => {
    renderList('officer');
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Event' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Remove Mathematics - Chapter 3/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument();
  });

  it('hides all officer controls for a member', () => {
    renderList('member');
    expect(
      screen.queryByRole('button', { name: 'Add task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Event' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remove Mathematics/ }),
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
    renderList(null);
    expect(
      screen.queryByRole('button', { name: 'Add task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Event' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remove Mathematics/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark done' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Mathematics - Chapter 3 exercises'),
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no tasks or events', () => {
    renderList('officer', { tasks: [], events: [] });
    expect(screen.getByText('No tasks or events yet.')).toBeInTheDocument();
  });
});

describe('TaskList merged tasks + events', () => {
  beforeEach(() => useSessionMock.mockReset());

  it('renders events with a type badge (icon + text, not color-only)', () => {
    renderList('member');
    // The event row shows the title and its EventBadge (text label "Exam").
    expect(screen.getByText('Midterm exam')).toBeInTheDocument();
    expect(screen.getByTestId('event-badge-exam')).toBeInTheDocument();
    expect(screen.getByText('Exam')).toBeInTheDocument();
  });

  it('shows an officer Remove control on an event row', () => {
    renderList('officer');
    expect(
      screen.getByRole('button', { name: 'Remove event Midterm exam' }),
    ).toBeInTheDocument();
  });
});

describe('TaskList personal tracker (completion checkbox + filter)', () => {
  beforeEach(() => useSessionMock.mockReset());

  it('renders a per-user completion checkbox and the filter only when signed in', () => {
    renderList('member');
    expect(
      screen.getByRole('checkbox', {
        name: /Mark Mathematics - Chapter 3 exercises done for me/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter my tasks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My unfinished' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My finished' })).toBeInTheDocument();
  });

  it('shows no checkbox or filter for an anonymous visitor', () => {
    renderList(null);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Filter my tasks' }),
    ).not.toBeInTheDocument();
  });

  it('reflects the completed state in the checkbox', () => {
    renderList('member', { completedTaskIds: new Set(['t1']) });
    const box = screen.getByRole('checkbox', {
      name: /Mark Mathematics - Chapter 3 exercises done for me/,
    });
    expect(box).toBeChecked();
    // The row still renders the task, with the sr-only done marker.
    expect(screen.getByText(/\(done\)/)).toBeInTheDocument();
  });

  it('My finished filter hides an unfinished task but keeps events', () => {
    useSessionMock.mockReturnValue(sessionFor('member'));
    const { rerender } = render(
      <TaskList
        subjects={subjects}
        tasks={tasks}
        events={events}
        completedTaskIds={new Set()}
        onAddLocalCompletion={noop}
        onRemoveLocalCompletion={noop}
      />,
    );
    screen.getByRole('button', { name: 'My finished' }).click();
    rerender(
      <TaskList
        subjects={subjects}
        tasks={tasks}
        events={events}
        completedTaskIds={new Set()}
        onAddLocalCompletion={noop}
        onRemoveLocalCompletion={noop}
      />,
    );
    // The unfinished task is filtered out...
    expect(
      screen.queryByText('Mathematics - Chapter 3 exercises'),
    ).not.toBeInTheDocument();
    // ...but the event always shows.
    expect(screen.getByText('Midterm exam')).toBeInTheDocument();
  });
});
