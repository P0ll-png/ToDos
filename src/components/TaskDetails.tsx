/**
 * TaskDetails — the presentational body of the task details popup, rendered
 * once by TaskList inside a shared Modal. It shows ALL the metadata that used
 * to live on the collapsed row (subject, full title, given date, deadline,
 * overdue status, class done/pending) and, for officers only, the relocated
 * "Mark done/Reopen" and "Remove" controls.
 *
 * It owns NO mutation logic: Mark done/Reopen calls onToggleStatus (and leaves
 * the popup open so the officer sees the result); Remove calls onRemove then
 * onClose. The busy disabled state is passed from TaskList; the inline error
 * alert stays in the TaskList card. Members and anonymous viewers never get the
 * officer footer (guarded on isOfficer by TaskList, but double-guarded here).
 */
import type { Subject, Task } from '../lib/types';
import { isOverdue, formatDeadline } from '../lib/derive';

interface TaskDetailsProps {
  task: Task;
  subject: Subject | undefined;
  isOfficer: boolean;
  busy: boolean;
  onToggleStatus: (task: Task) => void;
  onRemove: (task: Task) => void;
  onClose: () => void;
}

export function TaskDetails({
  task,
  subject,
  isOfficer,
  busy,
  onToggleStatus,
  onRemove,
  onClose,
}: TaskDetailsProps) {
  const subjectName = subject?.name ?? 'Unknown subject';
  const overdue = isOverdue(task);
  const classDone = task.status === 'done';
  const titleId = 'task-details-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={dialogStyle}
    >
      <h2 id={titleId} style={{ marginTop: 0 }}>
        <strong>{subjectName}</strong>: {task.title}
      </h2>

      <dl style={listStyle}>
        <div style={rowStyle}>
          <dt style={dtStyle}>Subject</dt>
          <dd style={ddStyle}>{subjectName}</dd>
        </div>
        <div style={rowStyle}>
          <dt style={dtStyle}>Title</dt>
          <dd style={ddStyle}>{task.title}</dd>
        </div>
        <div style={rowStyle}>
          <dt style={dtStyle}>Given</dt>
          <dd style={ddStyle}>{task.givenDate}</dd>
        </div>
        <div style={rowStyle}>
          <dt style={dtStyle}>Deadline</dt>
          <dd style={ddStyle}>
            {task.deadline ? formatDeadline(task.deadline) : 'No deadline'}
          </dd>
        </div>
        <div style={rowStyle}>
          <dt style={dtStyle}>Status</dt>
          <dd style={ddStyle}>
            {overdue ? 'Overdue' : classDone ? 'Done' : 'Pending'}
          </dd>
        </div>
        {task.notes && (
          <div style={rowStyle}>
            <dt style={dtStyle}>Notes</dt>
            <dd style={ddStyle}>{task.notes}</dd>
          </div>
        )}
      </dl>

      {isOfficer && (
        <div style={actionsStyle}>
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
            onClick={() => {
              onRemove(task);
              onClose();
            }}
            disabled={busy}
            aria-label={`Remove ${subjectName} - ${task.title}`}
            style={removeButtonStyle}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

const dialogStyle: React.CSSProperties = {
  padding: '1.5rem',
  maxWidth: '24rem',
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
};

const listStyle: React.CSSProperties = {
  margin: '0 0 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const dtStyle: React.CSSProperties = {
  margin: 0,
  minWidth: '5rem',
  fontWeight: 600,
  color: 'var(--muted)',
  fontSize: '0.8125rem',
};

const ddStyle: React.CSSProperties = {
  margin: 0,
  flex: 1,
  minWidth: 0,
  fontSize: '0.875rem',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const removeButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: 'var(--danger)',
  borderColor: 'var(--danger)',
};
