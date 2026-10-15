/**
 * EventRow — one event in the right-hand merged list. Shows the EventBadge
 * (icon + text + token, so type is never color-only), the title, the optional
 * subject, the date and optional time range, and an optional location. Officers
 * get a Remove button (RLS-backed; UI convenience only — the DB rejects forged
 * writes). Members and anon see a read-only row.
 */
import type { EventItem, Subject } from '../lib/types';
import { EventBadge } from './EventBadge';

interface EventRowProps {
  event: EventItem;
  subject: Subject | undefined;
  isOfficer: boolean;
  busy: boolean;
  onRemove: (event: EventItem) => void;
  /** Null when signed out: no personal checkbox is rendered. */
  signedIn: boolean;
  /** Whether the viewer has marked this event done for themselves. */
  completedForMe: boolean;
  /** Toggle the viewer's own completion (optimistic). */
  onToggleCompletion: (event: EventItem, next: boolean) => void;
}

/** 'HH:MM:SS' / 'HH:MM' -> 'HH:MM'. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function EventRow({
  event,
  subject,
  isOfficer,
  busy,
  onRemove,
  signedIn,
  completedForMe,
  onToggleCompletion,
}: EventRowProps) {
  const timeLabel =
    event.startTime == null
      ? ''
      : event.endTime == null
        ? ` · ${hhmm(event.startTime)}`
        : ` · ${hhmm(event.startTime)}–${hhmm(event.endTime)}`;

  return (
    <li style={rowStyle}>
      {signedIn && (
        <input
          type="checkbox"
          checked={completedForMe}
          onChange={(e) => onToggleCompletion(event, e.target.checked)}
          aria-label={`Mark event ${event.title} done for me`}
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
          <EventBadge type={event.type} />
          <span style={{ fontWeight: 600 }}>{event.title}</span>
          {completedForMe && <span className="sr-only"> (done)</span>}
        </div>
        <p
          className="muted"
          style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted)' }}
        >
          {subject ? `${subject.name} · ` : ''}
          {event.eventDate}
          {timeLabel}
          {event.location ? ` · ${event.location}` : ''}
        </p>
      </div>

      {isOfficer && (
        <div style={controlsStyle}>
          <button
            type="button"
            onClick={() => onRemove(event)}
            disabled={busy}
            aria-label={`Remove event ${event.title}`}
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
  border: '1px solid var(--border)',
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

const removeButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: 'var(--surface)',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontSize: '0.8125rem',
  fontWeight: 500,
};
