/**
 * EventDetails — the presentational body of the event details popup, rendered
 * once by TaskList inside a shared Modal. It shows the EventBadge, the full
 * title, the optional subject, the date, the optional time range, location and
 * notes, and — for officers only — the relocated "Remove" control.
 *
 * It owns NO mutation logic: Remove calls onRemove then onClose. The busy
 * disabled state is passed from TaskList; the inline error alert stays in the
 * TaskList card. Members and anonymous viewers never get the officer footer.
 */
import type { EventItem, Subject } from '../lib/types';
import { EventBadge } from './EventBadge';
import { eventTimeLabel } from '../lib/event-time';

interface EventDetailsProps {
  event: EventItem;
  subject: Subject | undefined;
  isOfficer: boolean;
  busy: boolean;
  onRemove: (event: EventItem) => void;
  onClose: () => void;
}

export function EventDetails({
  event,
  subject,
  isOfficer,
  busy,
  onRemove,
  onClose,
}: EventDetailsProps) {
  const timeLabel = eventTimeLabel(event);
  const titleId = 'event-details-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={dialogStyle}
    >
      <div style={headingRowStyle}>
        <EventBadge type={event.type} />
        <h2 id={titleId} style={{ margin: 0, fontSize: '1rem' }}>
          {event.title}
        </h2>
      </div>

      <dl style={listStyle}>
        {subject && (
          <div style={rowStyle}>
            <dt style={dtStyle}>Subject</dt>
            <dd style={ddStyle}>{subject.name}</dd>
          </div>
        )}
        <div style={rowStyle}>
          <dt style={dtStyle}>Date</dt>
          <dd style={ddStyle}>
            {event.eventDate}
            {timeLabel}
          </dd>
        </div>
        {event.location && (
          <div style={rowStyle}>
            <dt style={dtStyle}>Location</dt>
            <dd style={ddStyle}>{event.location}</dd>
          </div>
        )}
        {event.notes && (
          <div style={rowStyle}>
            <dt style={dtStyle}>Notes</dt>
            <dd style={ddStyle}>{event.notes}</dd>
          </div>
        )}
      </dl>

      {isOfficer && (
        <div style={actionsStyle}>
          <button
            type="button"
            onClick={() => {
              onRemove(event);
              onClose();
            }}
            disabled={busy}
            aria-label={`Remove event ${event.title}`}
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

const headingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  marginBottom: '1rem',
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

const removeButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
