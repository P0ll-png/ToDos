/**
 * DetailsPanel — for the selected subject, lists ONLY that subject's PENDING
 * tasks (title, note, date given, deadline), sorted nearest-deadline-first via
 * sorting.ts. Overdue pending tasks are flagged with --danger (viewer-local
 * date via localTodayISO). Empty states: no selection, and selected-with-no-
 * pending. If the selected subject was deleted (not in `subjects`), the parent
 * clears selection; here we also render the no-selection state defensively.
 */
import { useMemo } from 'react';
import type { Subject, Task } from '../lib/types';
import { isOverdue, formatDeadline } from '../lib/derive';
import { sortByDeadline } from '../lib/sorting';

interface DetailsPanelProps {
  subjects: Subject[];
  tasks: Task[];
  selectedSubjectId: string | null;
}

export function DetailsPanel({
  subjects,
  tasks,
  selectedSubjectId,
}: DetailsPanelProps) {
  const subject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId],
  );

  const pending = useMemo(() => {
    if (!subject) return [];
    return sortByDeadline(
      tasks.filter((t) => t.subjectId === subject.id && t.status === 'pending'),
    );
  }, [subject, tasks]);

  if (!subject) {
    return (
      <section aria-label="Subject details" className="card" style={sectionStyle}>
        <h2 style={headingStyle}>Details</h2>
        <p className="muted" style={{ color: 'var(--muted)' }}>
          Select a subject to see its pending tasks.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Subject details" className="card" style={sectionStyle}>
      <h2 style={headingStyle}>
        {subject.name}
        {subject.room && (
          <span
            className="muted"
            style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: '0.5rem' }}
          >
            {subject.room}
          </span>
        )}
      </h2>

      {pending.length === 0 ? (
        <p className="muted" style={{ color: 'var(--muted)' }}>
          No pending tasks for this subject.
        </p>
      ) : (
        <ul style={listStyle}>
          {pending.map((task) => {
            const overdue = isOverdue(task);
            return (
              <li
                key={task.id}
                style={{
                  ...itemStyle,
                  border: `1px solid ${overdue ? 'var(--danger)' : 'var(--border)'}`,
                }}
              >
                <div style={titleRowStyle}>
                  <span style={{ fontWeight: 600 }}>{task.title}</span>
                  {overdue && <span style={overdueBadgeStyle}>Overdue</span>}
                </div>
                {task.notes && (
                  <p style={{ margin: '0.25rem 0 0' }}>{task.notes}</p>
                )}
                <p
                  className="muted"
                  style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted)' }}
                >
                  Given {task.givenDate}
                  {task.deadline ? ` · Due ${formatDeadline(task.deadline)}` : ' · No deadline'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--surface)',
};

const headingStyle: React.CSSProperties = {
  fontSize: '1rem',
  marginTop: 0,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const itemStyle: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  borderRadius: 'calc(var(--radius) - 4px)',
  background: 'var(--surface-2)',
};

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
};

const overdueBadgeStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  padding: '0.0625rem 0.375rem',
  borderRadius: '999px',
  background: 'var(--danger)',
  color: 'var(--danger-contrast)',
};
