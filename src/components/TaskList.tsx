/**
 * TaskList — the full class to-do list on the right column. Every row is
 * "Subject - Task" + date given + deadline, sorted nearest-deadline-first with
 * null deadlines last (sorting.ts over ALL tasks). Overdue pending rows are
 * flagged. Officers get an "Add task" button (opens AddTaskDialog) and per-row
 * remove + status controls; members and anonymous visitors get none of them.
 * The DB rejects forged writes regardless of what the UI shows.
 *
 * No optimistic UI: a mutation that succeeds reconciles via Realtime; a denial
 * or network error surfaces an inline message and leaves state untouched.
 */
import { useMemo, useState } from 'react';
import type { Subject, Task } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { sortByDeadline } from '../lib/sorting';
import {
  MUTATION_MESSAGES,
  removeTask,
  setTaskStatus,
} from '../data/mutations';
import { AddTaskDialog } from './AddTaskDialog';
import { TaskRow } from './TaskRow';
import { Modal } from './Modal';

interface TaskListProps {
  subjects: Subject[];
  tasks: Task[];
}

export function TaskList({ subjects, tasks }: TaskListProps) {
  const { isOfficer } = useSession();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectById = useMemo(() => {
    const map = new Map<string, Subject>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  const sorted = useMemo(() => sortByDeadline(tasks), [tasks]);

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

  async function handleRemove(task: Task) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await removeTask(task.id);
    if (!result.ok && result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  return (
    <section aria-label="Class to-do list" className="card" style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={headingStyle}>To-do list</h2>
        {isOfficer && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            style={accentButtonStyle}
          >
            Add task
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 0.75rem' }}>
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="muted" style={{ color: 'var(--muted)' }}>
          No tasks yet.
        </p>
      ) : (
        <ul style={listStyle}>
          {sorted.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              subject={subjectById.get(task.subjectId)}
              isOfficer={isOfficer}
              busy={busy}
              onToggleStatus={handleToggleStatus}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
          <AddTaskDialog subjects={subjects} onClose={() => setShowAdd(false)} />
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
