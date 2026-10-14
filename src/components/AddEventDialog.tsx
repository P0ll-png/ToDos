/**
 * AddEventDialog — the officer-only event creation form, opened from the "Add
 * Event" button in TaskList (shown only when isOfficer). Fields (FR-1.3): a
 * type <select> (the four enum values), title (required, trimmed 1–200), an
 * optional subject <select> (with a "— none —" option), an event date
 * (CalendarField), optional start/end <input type="time"> treated as a pair
 * (an end may be set only when a start is present, and then end >= start),
 * a location, and notes.
 *
 * Submit calls mutations.addEvent and does NOT optimistically update — the row
 * arrives via Realtime (like AddTaskDialog). Client validation is UX only; the
 * DB enforces integrity (events_time_order CHECK) and RLS authorization
 * (events_write is_officer()) regardless. location/notes send '' (not null).
 */
import { useState, type FormEvent } from 'react';
import type { EventType, Subject } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { localTodayISO } from '../lib/derive';
import { MUTATION_MESSAGES, addEvent } from '../data/mutations';
import { CalendarField } from './CalendarField';

const TITLE_MAX = 200;
const LOCATION_MAX = 200;
const NOTES_MAX = 2000;

const TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'school_event', label: 'School event' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'exam', label: 'Exam' },
  { value: 'presentation', label: 'Presentation' },
];

interface AddEventDialogProps {
  subjects: Subject[];
  onClose: () => void;
}

export function AddEventDialog({ subjects, onClose }: AddEventDialogProps) {
  const { profile } = useSession();
  const [type, setType] = useState<EventType>('school_event');
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [eventDate, setEventDate] = useState(localTodayISO());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedTitle = title.trim();
  const titleValid = trimmedTitle.length >= 1 && trimmedTitle.length <= TITLE_MAX;
  const dateValid = eventDate !== '';
  // Times are a pair: an end requires a start, and end >= start. A bare end is
  // invalid (mirrors the DB events_time_order CHECK, which rejects it).
  const endWithoutStart = endTime !== '' && startTime === '';
  const endBeforeStart =
    startTime !== '' && endTime !== '' && endTime < startTime;
  const timesValid = !endWithoutStart && !endBeforeStart;
  const canSubmit = titleValid && dateValid && timesValid && !busy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await addEvent({
      type,
      title: trimmedTitle,
      subjectId: subjectId || null,
      eventDate,
      startTime: startTime || null,
      endTime: endTime || null,
      location,
      notes,
      createdBy: profile?.id ?? null,
    });
    if (result.ok) {
      onClose();
      return;
    }
    if (result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  const titleId = 'add-event-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={dialogStyle}
    >
      <h2 id={titleId} style={{ marginTop: 0 }}>
        Add event
      </h2>

      <form onSubmit={handleSubmit}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
            style={inputStyle}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            Subject{' '}
            <span className="muted" style={{ color: 'var(--muted)' }}>
              (optional)
            </span>
          </span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— none —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.room ? ` (${s.room})` : ''}
              </option>
            ))}
          </select>
          {type !== 'school_event' && subjectId === '' && (
            <p
              className="muted"
              style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}
            >
              Tip: assessments usually belong to a subject.
            </p>
          )}
        </label>

        <div style={fieldStyle}>
          <span style={labelStyle}>Date</span>
          <CalendarField label="Event date" value={eventDate} onChange={setEventDate} />
        </div>

        <div style={fieldStyle}>
          <span style={labelStyle}>Time (optional)</span>
          <div className="deadline-row">
            <input
              type="time"
              aria-label="Start time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="deadline-time"
              style={inputStyle}
            />
            <input
              type="time"
              aria-label="End time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="deadline-time"
              style={inputStyle}
            />
          </div>
          {endWithoutStart && (
            <p role="status" style={hintStyle}>
              Set a start time before an end time.
            </p>
          )}
          {endBeforeStart && (
            <p role="status" style={hintStyle}>
              End time must be at or after the start time.
            </p>
          )}
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>
            Location{' '}
            <span className="muted" style={{ color: 'var(--muted)' }}>
              (optional)
            </span>
          </span>
          <input
            type="text"
            value={location}
            maxLength={LOCATION_MAX}
            onChange={(e) => setLocation(e.target.value)}
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

        {error && (
          <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 0.75rem' }}>
            {error}
          </p>
        )}

        <div style={actionsStyle}>
          <button type="submit" disabled={!canSubmit} style={accentButtonStyle}>
            Add event
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.75rem',
  color: 'var(--muted)',
};

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
