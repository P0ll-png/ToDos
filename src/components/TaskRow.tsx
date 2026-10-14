/**
 * TaskRow — one row of the full class to-do list: "Subject - Task" plus date
 * given and deadline. Overdue pending rows are flagged with --danger.
 *
 * Personal tracker (FR-2.6): when the viewer is signed in, a leading checkbox
 * reflects whether THEY have marked the task done (completedTaskIds.has). A
 * completed row is dimmed (--task-done) and struck through, with the checkbox
 * state and an sr-only "(done)" so completion is never color-only. The checkbox
 * writes ONLY the per-user task_completions table — never tasks.status. Anon
 * visitors see no checkbox.
 *
 * The officer remove button and class-status toggle render ONLY for officers.
 * This is UI convenience only — the DB rejects forged writes regardless (RLS).
 */
import type { Subject, Task } from '../lib/types';
import { isOverdue, formatDeadline } from '../lib/derive';

interface TaskRowProps {
  task: Task;
  subject: Subject | undefined;
  isOfficer: boolean;
  busy: boolean;
  onToggleStatus: (task: Task) => void;
  onRemove: (task: Task) => void;
  /** Null when signed out: no personal checkbox is rendered. */
  signedIn: boolean;
  /** Whether the viewer has marked this task done for themselves. */
  completedForMe: boolean;
  /** Toggle the viewer's own completion (optimistic). */
  onToggleCompletion: (task: Task, next: boolean) => void;
}

export function TaskRow({
  task,
  subject,
  isOfficer,
  busy,
  onToggleStatus,
  onRemove,
  signedIn,
  completedForMe,
  onToggleCompletion,
}: TaskRowProps) {
  const overdue = isOverdue(task);
  const subjectName = subject?.name ?? 'Unknown subject';
  const classDone = task.status === 'done';

  return (
    <li
      style={{
        ...rowStyle,
        border: `1px solid ${overdue ? 'var(--danger)' : 'var(--border)'}`,
      }}
    >
      {signedIn && (
        <input
          type="checkbox"
          checked={completedForMe}
          onChange={(e) => onToggleCompletion(task, e.target.checked)}
          aria-label={`Mark ${subjectName} - ${task.title} done for me`}
          style={checkboxStyle}
        />
      )}

      <div
        style={{
          minWidth: 0,
          flex: 1,
          ...(completedForMe
            ? { color: 'var(--task-done)', textDecoration: 'line-through' }
            : null),
        }}
      >
        <div style={titleRowStyle}>
          <span style={{ fontWeight: 600 }}>
            {subjectName} - {task.title}
          </span>
          {completedForMe && <span className="sr-only"> (done)</span>}
          {overdue && <span style={overdueBadgeStyle}>Overdue</span>}
          {classDone && (
            <span className="muted" style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
              Done
            </span>
          )}
        </div>
        <p
          className="muted"
          style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted)' }}
        >
          Given {task.givenDate}
          {task.deadline ? ` · Due ${formatDeadline(task.deadline)}` : ' · No deadline'}
        </p>
      </div>

      {isOfficer && (
        <div style={controlsStyle}>
          <button
            type="button"
            onClick={() => onToggleStatus(task)}
            disabled={busy}
            style={secondaryButtonStyle}
          >
            {classDone ? 'Reopen' : 'Mark done'}
          </button>
          <button
            type="button"
            onClick={() => onRemove(task)}
            disabled={busy}
            aria-label={`Remove ${subjectName} - ${task.title}`}
            style={removeButtonStyle}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.625rem 0.75rem',
  borderRadius: 'calc(var(--radius) - 4px)',
  background: 'var(--surface-2)',
};

const checkboxStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '1.1rem',
  height: '1.1rem',
  marginTop: '0.15rem',
  accentColor: 'var(--accent)',
};

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const controlsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.375rem',
  flexShrink: 0,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontSize: '0.8125rem',
  fontWeight: 500,
};

const removeButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: 'var(--danger)',
  borderColor: 'var(--danger)',
};

const overdueBadgeStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  padding: '0.0625rem 0.375rem',
  borderRadius: '999px',
  background: 'var(--danger)',
  color: 'var(--danger-contrast)',
};
