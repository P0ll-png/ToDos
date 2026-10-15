/**
 * TaskList — the full class to-do list on the right column, now a MERGED list
 * of tasks and events. Tasks and events are normalized through the shared
 * CalendarItem shape (calendar.ts) and sorted by the single explicit order
 * (datePart asc, then kind tasks-before-events, then startTime asc nulls-last,
 * then title). Each row renders by kind: a TaskRow or an EventRow. The React
 * key is `${kind}:${id}` so the renderer can branch unambiguously.
 *
 * Officers get "Add task" and "Add Event" buttons plus per-row remove/status
 * controls; members and anonymous visitors get none of them. The DB rejects
 * forged writes regardless of what the UI shows.
 *
 * Personal tracker (signed-in only): each task row has a per-user completion
 * checkbox (optimistic markTaskDone/unmarkTaskDone), and a segmented filter
 * (All / My unfinished / My finished) narrows the task rows by the viewer's own
 * completion set. The filter never affects events — they always show.
 *
 * No optimistic UI for class writes: a successful mutation reconciles via
 * Realtime; a denial or network error surfaces inline and leaves state
 * untouched. The ONE optimistic exception is the personal completion toggle.
 */
import { useMemo, useState } from 'react';
import type { CalendarItem, EventItem, Subject, Task } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { mergeCalendarItems } from '../lib/calendar';
import {
  MUTATION_MESSAGES,
  markEventDone,
  markTaskDone,
  removeEvent,
  removeTask,
  setTaskStatus,
  unmarkEventDone,
  unmarkTaskDone,
} from '../data/mutations';
import { AddTaskDialog } from './AddTaskDialog';
import { AddEventDialog } from './AddEventDialog';
import { TaskRow } from './TaskRow';
import { EventRow } from './EventRow';
import { Modal } from './Modal';

type CompletionFilter = 'all' | 'unfinished' | 'finished';

interface TaskListProps {
  subjects: Subject[];
  tasks: Task[];
  events: EventItem[];
  /** The signed-in viewer's own completed task ids (empty when signed out). */
  completedTaskIds: Set<string>;
  /** Optimistically add/remove a task id in the parent completion set. */
  onAddLocalCompletion: (taskId: string) => void;
  onRemoveLocalCompletion: (taskId: string) => void;
  /** The signed-in viewer's own completed event ids (empty when signed out). */
  completedEventIds: Set<string>;
  /** Optimistically add/remove an event id in the parent completion set. */
  onAddLocalEventCompletion: (eventId: string) => void;
  onRemoveLocalEventCompletion: (eventId: string) => void;
}

export function TaskList({
  subjects,
  tasks,
  events,
  completedTaskIds,
  onAddLocalCompletion,
  onRemoveLocalCompletion,
  completedEventIds,
  onAddLocalEventCompletion,
  onRemoveLocalEventCompletion,
}: TaskListProps) {
  const { isOfficer, session, profile } = useSession();
  const signedIn = session != null;
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CompletionFilter>('all');

  const subjectById = useMemo(() => {
    const map = new Map<string, Subject>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  const taskById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  const eventById = useMemo(() => {
    const map = new Map<string, EventItem>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);

  const merged = useMemo(
    () => mergeCalendarItems(tasks, events, completedTaskIds),
    [tasks, events, completedTaskIds],
  );

  // The completion filter narrows TASK items only; events always pass.
  const visible = useMemo(() => {
    if (!signedIn || filter === 'all') return merged;
    return merged.filter((item) => {
      if (item.kind !== 'task') return true;
      const done = completedTaskIds.has(item.id);
      return filter === 'finished' ? done : !done;
    });
  }, [merged, filter, signedIn, completedTaskIds]);

  async function handleToggleStatus(task: Task) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await setTaskStatus(
      task.id,
      task.status === 'pending' ? 'done' : 'pending',
    );
    if (!result.ok && result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  async function handleRemoveTask(task: Task) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await removeTask(task.id);
    if (!result.ok && result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  async function handleRemoveEvent(event: EventItem) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await removeEvent(event.id);
    if (!result.ok && result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  // The ONE optimistic path: flip the local set first, then write, revert on
  // error. Realtime reconcile is idempotent on the set and is the truth.
  async function handleToggleCompletion(task: Task, next: boolean) {
    const uid = profile?.id ?? session?.user.id ?? null;
    if (!uid) return;
    if (next) onAddLocalCompletion(task.id);
    else onRemoveLocalCompletion(task.id);
    setError(null);
    const result = next
      ? await markTaskDone(task.id, uid)
      : await unmarkTaskDone(task.id, uid);
    if (!result.ok) {
      // Revert the optimistic change.
      if (next) onRemoveLocalCompletion(task.id);
      else onAddLocalCompletion(task.id);
      if (result.error) setError(MUTATION_MESSAGES[result.error]);
    }
  }

  // Event completion mirrors the task toggle: optimistic flip, revert on error.
  async function handleToggleEventCompletion(event: EventItem, next: boolean) {
    const uid = profile?.id ?? session?.user.id ?? null;
    if (!uid) return;
    if (next) onAddLocalEventCompletion(event.id);
    else onRemoveLocalEventCompletion(event.id);
    setError(null);
    const result = next
      ? await markEventDone(event.id, uid)
      : await unmarkEventDone(event.id, uid);
    if (!result.ok) {
      // Revert the optimistic change.
      if (next) onRemoveLocalEventCompletion(event.id);
      else onAddLocalEventCompletion(event.id);
      if (result.error) setError(MUTATION_MESSAGES[result.error]);
    }
  }

  function renderItem(item: CalendarItem) {
    if (item.kind === 'task') {
      const task = taskById.get(item.id);
      if (!task) return null;
      return (
        <TaskRow
          key={`task:${task.id}`}
          task={task}
          subject={subjectById.get(task.subjectId)}
          isOfficer={isOfficer}
          busy={busy}
          onToggleStatus={handleToggleStatus}
          onRemove={handleRemoveTask}
          signedIn={signedIn}
          completedForMe={completedTaskIds.has(task.id)}
          onToggleCompletion={handleToggleCompletion}
        />
      );
    }
    const event = eventById.get(item.id);
    if (!event) return null;
    return (
      <EventRow
        key={`event:${event.id}`}
        event={event}
        subject={event.subjectId ? subjectById.get(event.subjectId) : undefined}
        isOfficer={isOfficer}
        busy={busy}
        onRemove={handleRemoveEvent}
        signedIn={signedIn}
        completedForMe={completedEventIds.has(event.id)}
        onToggleCompletion={handleToggleEventCompletion}
      />
    );
  }

  return (
    <section aria-label="Class to-do list" className="card" style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={headingStyle}>To-do list</h2>
        {isOfficer && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setShowAddTask(true)}
              style={accentButtonStyle}
            >
              Add task
            </button>
            <button
              type="button"
              onClick={() => setShowAddEvent(true)}
              style={secondaryButtonStyle}
            >
              Add Event
            </button>
          </div>
        )}
      </div>

      {signedIn && (
        <div
          role="group"
          aria-label="Filter my tasks"
          style={filterRowStyle}
        >
          {(
            [
              ['all', 'All'],
              ['unfinished', 'My unfinished'],
              ['finished', 'My finished'],
            ] as [CompletionFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              style={filter === value ? segActiveStyle : segStyle}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 0.75rem' }}>
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="muted" style={{ color: 'var(--muted)' }}>
          {merged.length === 0 ? 'No tasks or events yet.' : 'Nothing matches this filter.'}
        </p>
      ) : (
        <ul style={listStyle}>{visible.map(renderItem)}</ul>
      )}

      {showAddTask && (
        <Modal onClose={() => setShowAddTask(false)}>
          <AddTaskDialog subjects={subjects} onClose={() => setShowAddTask(false)} />
        </Modal>
      )}
      {showAddEvent && (
        <Modal onClose={() => setShowAddEvent(false)}>
          <AddEventDialog subjects={subjects} onClose={() => setShowAddEvent(false)} />
        </Modal>
      )}
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--surface)',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  marginBottom: '0.75rem',
};

const headingStyle: React.CSSProperties = {
  fontSize: '1rem',
  margin: 0,
};

const filterRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.25rem',
  marginBottom: '0.75rem',
  flexWrap: 'wrap',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const segStyle: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontSize: '0.8125rem',
  fontWeight: 500,
};

const segActiveStyle: React.CSSProperties = {
  ...segStyle,
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  borderColor: 'var(--accent)',
};
