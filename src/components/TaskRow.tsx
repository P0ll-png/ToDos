/**
 * TaskRow — one collapsed row of the full class to-do list. It shows ONLY three
 * things, laid out for small/mobile screens:
 *   1. "Subject: title" (subject bold, then the task title);
 *   2. an accent-colored rounded due-date pill (danger "Overdue · …" when the
 *      task is overdue, neutral "No deadline" when it has none) — overdue is
 *      never color-only;
 *   3. a "Details" button.
 *
 * Clicking the title/pill region OR the Details button opens a details popup
 * (owned by TaskList) via onOpenDetails. The full metadata and the officer
 * "Mark done/Reopen" + "Remove" controls live INSIDE that popup — never on the
 * collapsed row.
 *
 * Personal tracker (FR-2.6): when the viewer is signed in, a leading checkbox
 * reflects whether THEY have marked the task done. A completed row is dimmed
 * (--task-done) and struck through, with an sr-only "(done)" so completion is
 * never color-only. The checkbox writes ONLY the per-user task_completions
 * table — never tasks.status. Anon visitors see no checkbox. The checkbox is a
 * sibling of the open/Details buttons (never nested) so it never opens the
 * popup.
 */
import type { Subject, Task } from '../lib/types';
import { isOverdue, formatDeadline } from '../lib/derive';

interface TaskRowProps {
  task: Task;
  subject: Subject | undefined;
  /** Open the details popup for this task (owned by TaskList). */
  onOpenDetails: () => void;
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
  onOpenDetails,
  signedIn,
  completedForMe,
  onToggleCompletion,
}: TaskRowProps) {
  const overdue = isOverdue(task);
  const subjectName = subject?.name ?? 'Unknown subject';
  const deadlineText = task.deadline ? formatDeadline(task.deadline) : '';

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

      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Open details for ${subjectName}: ${task.title}`}
        style={rowOpenStyle}
      >
        <span
          style={{
            ...titleStyle,
            ...(completedForMe
              ? { color: 'var(--task-done)', textDecoration: 'line-through' }
              : null),
          }}
        >
          <strong>{subjectName}</strong>: {task.title}
          {completedForMe && <span className="sr-only"> (done)</span>}
        </span>
        <span style={dueText(overdue, Boolean(task.deadline))}>
          {overdue
            ? `Overdue · ${deadlineText}`
            : task.deadline
              ? deadlineText
              : 'No deadline'}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Details for ${subjectName}: ${task.title}`}
        style={detailsButtonStyle}
      >
        Details
      </button>
    </li>
  );
}

/** Pill style by overdue/has-deadline state. */
function dueText(overdue: boolean, hasDeadline: boolean): React.CSSProperties {
  if (overdue) return { ...pillBaseStyle, ...dangerPillStyle };
  if (hasDeadline) return { ...pillBaseStyle, ...accentPillStyle };
  return { ...pillBaseStyle, ...neutralPillStyle };
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  padding: '0.625rem 0.75rem',
  borderRadius: 'calc(var(--radius) - 4px)',
  background: 'var(--surface-2)',
};

const checkboxStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '1.1rem',
  height: '1.1rem',
  accentColor: 'var(--accent)',
};

const rowOpenStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  minWidth: 0,
  gap: '0.5rem',
  flexWrap: 'wrap',
  alignItems: 'center',
  textAlign: 'left',
  background: 'transparent',
  border: 0,
  color: 'inherit',
  cursor: 'pointer',
  padding: 0,
  font: 'inherit',
};

const titleStyle: React.CSSProperties = {
  minWidth: 0,
  fontWeight: 500,
};

const pillBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  padding: '0.125rem 0.5rem',
  borderRadius: 'var(--radius)',
  fontSize: '0.75rem',
  fontWeight: 600,
};

const accentPillStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
};

const dangerPillStyle: React.CSSProperties = {
  background: 'var(--danger)',
  color: 'var(--danger-contrast)',
};

const neutralPillStyle: React.CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--muted)',
  border: '1px solid var(--border)',
};

const detailsButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '0.25rem 0.625rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontSize: '0.8125rem',
  fontWeight: 500,
};
