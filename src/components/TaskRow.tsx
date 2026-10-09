/**
 * TaskRow — one row of the full class to-do list: "Subject - Task" plus date
 * given and deadline. Overdue pending rows are flagged with --danger. The
 * remove button and status toggle render ONLY for officers; members and
 * anonymous visitors see neither. This is UI convenience only — the DB rejects
 * forged writes regardless (RLS is_officer()).
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
}

export function TaskRow({
  task,
  subject,
  isOfficer,
  busy,
  onToggleStatus,
  onRemove,
}: TaskRowProps) {
  const overdue = isOverdue(task);
  const subjectName = subject?.name ?? 'Unknown subject';
  const done = task.status === 'done';

  return (
    <li
      style={{
        ...rowStyle,
        border: `1px solid ${overdue ? 'var(--danger)' : 'var(--border)'}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={titleRowStyle}>
          <span style={{ fontWeight: 600 }}>
            {subjectName} - {task.title}
          </span>
          {overdue && <span style={overdueBadgeStyle}>Overdue</span>}
          {done && (
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
            {done ? 'Reopen' : 'Mark done'}
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
