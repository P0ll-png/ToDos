/**
 * AddTaskDialog — the officer-only task creation form. Opened from TaskList.
 * Fields: subject (required), title (required, trimmed, 1–200), notes
 * (optional, 0–2000), givenDate (defaults to today), deadline (optional; if
 * earlier than givenDate we WARN but still allow). All controls are real
 * <button>/<input>/<select> with the global focus ring.
 *
 * Submit calls mutations.addTask and does NOT optimistically update — the row
 * arrives via Realtime. Client validation is UX only; the DB enforces integrity
 * and RLS authorization regardless.
 */
import { useState, type FormEvent } from 'react';
import type { Subject } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { localTodayISO } from '../lib/derive';
import { MUTATION_MESSAGES, addTask } from '../data/mutations';
import { DateSelect } from './DateSelect';

const TITLE_MAX = 200;
const NOTES_MAX = 2000;

interface AddTaskDialogProps {
  subjects: Subject[];
  onClose: () => void;
}

export function AddTaskDialog({ subjects, onClose }: AddTaskDialogProps) {
  const { profile } = useSession();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [givenDate, setGivenDate] = useState(localTodayISO());
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedTitle = title.trim();
  const titleValid = trimmedTitle.length >= 1 && trimmedTitle.length <= TITLE_MAX;
  const notesValid = notes.length <= NOTES_MAX;
  // Date given is required and must be fully selected (DateSelect yields '' if
  // any of day/month/year is cleared). Deadline stays optional.
  const givenDateValid = givenDate !== '';
  const canSubmit =
    Boolean(subjectId) && titleValid && notesValid && givenDateValid && !busy;
  // Deadline before given date is allowed, but warned (back-dating is legit).
  const deadlineWarn =
    deadline !== '' && givenDate !== '' && deadline < givenDate;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await addTask({
      subjectId,
      title: trimmedTitle,
      notes,
      givenDate,
      deadline: deadline === '' ? null : deadline,
      createdBy: profile?.id ?? null,
    });
    if (result.ok) {
      onClose();
      return;
    }
    if (result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  const titleId = 'add-task-title';
  const noSubjects = subjects.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={dialogStyle}
    >
      <h2 id={titleId} style={{ marginTop: 0 }}>
        Add task
      </h2>

      {noSubjects ? (
        <>
          <p className="muted" style={{ color: 'var(--muted)' }}>
            Add a subject in Supabase before creating tasks.
          </p>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Close
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Subject</span>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              style={inputStyle}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.room ? ` (${s.room})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Title</span>
            <input
              type="text"
              value={title}
              required
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>
              Notes{' '}
              <span className="muted" style={{ color: 'var(--muted)' }}>
                ({notes.length}/{NOTES_MAX})
              </span>
            </span>
            <textarea
              value={notes}
              maxLength={NOTES_MAX}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>

          <div style={fieldStyle}>
            <span style={labelStyle}>Date given</span>
            <DateSelect
              label="Date given"
              value={givenDate}
              onChange={setGivenDate}
            />
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle}>Deadline (optional)</span>
            <DateSelect
              label="Deadline"
              value={deadline}
              onChange={setDeadline}
              optional
            />
          </div>

          {deadlineWarn && (
            <p role="status" style={{ color: 'var(--muted)', margin: '0 0 0.75rem' }}>
              Deadline is before the date given — allowed, just double-check.
            </p>
          )}

          {error && (
            <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 0.75rem' }}>
              {error}
            </p>
          )}

          <div style={actionsStyle}>
            <button type="submit" disabled={!canSubmit} style={accentButtonStyle}>
              Add task
            </button>
            <button type="button" onClick={onClose} style={secondaryButtonStyle}>
              Cancel
            </button>
          </div>
        </form>
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

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.25rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  font: 'inherit',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
