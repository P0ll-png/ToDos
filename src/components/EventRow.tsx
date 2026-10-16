/**
 * EventRow — one collapsed event row in the right-hand merged list. Mirrors
 * TaskRow: it shows the EventBadge (type is never color-only), "Subject: title"
 * (or just the title when the event has no subject), an accent-colored
 * rounded due-date pill (event date + optional time range), and a "Details"
 * button. Events always have a date, so they always get the accent pill.
 *
 * Clicking the title/pill region OR the Details button opens the details popup
 * (owned by TaskList) via onOpenDetails. All metadata (location, notes, time)
 * and the officer "Remove" control live INSIDE that popup — never on the
 * collapsed row.
 *
 * Personal tracker: when signed in, a leading checkbox reflects the viewer's
 * own completion; a completed row is dimmed/struck with an sr-only "(done)".
 * The checkbox is a sibling of the buttons (never nested) so it never opens the
 * popup. Anon visitors see no checkbox.
 */
import type { EventItem, Subject } from '../lib/types';
import { eventTimeLabel } from '../lib/event-time';
import { EventBadge } from './EventBadge';

interface EventRowProps {
  event: EventItem;
  subject: Subject | undefined;
  /** Open the details popup for this event (owned by TaskList). */
  onOpenDetails: () => void;
  /** Null when signed out: no personal checkbox is rendered. */
  signedIn: boolean;
  /** Whether the viewer has marked this event done for themselves. */
  completedForMe: boolean;
  /** Toggle the viewer's own completion (optimistic). */
  onToggleCompletion: (event: EventItem, next: boolean) => void;
}

export function EventRow({
  event,
  subject,
  onOpenDetails,
  signedIn,
  completedForMe,
  onToggleCompletion,
}: EventRowProps) {
  const timeLabel = eventTimeLabel(event);

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

      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Open details for event ${event.title}`}
        style={rowOpenStyle}
      >
        <EventBadge type={event.type} />
        <span
          style={{
            ...titleStyle,
            ...(completedForMe
              ? { color: 'var(--task-done)', textDecoration: 'line-through' }
              : null),
          }}
        >
          {subject ? (
            <>
              <strong>{subject.name}</strong>: {event.title}
            </>
          ) : (
            event.title
          )}
          {completedForMe && <span className="sr-only"> (done)</span>}
        </span>
        <span style={accentPillStyle}>
          {event.eventDate}
          {timeLabel}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Details for event ${event.title}`}
        style={detailsButtonStyle}
      >
        Details
      </button>
    </li>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  padding: '0.625rem 0.75rem',
  borderRadius: 'calc(var(--radius) - 4px)',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
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

const accentPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  padding: '0.125rem 0.5rem',
  borderRadius: 'var(--radius)',
  fontSize: '0.75rem',
  fontWeight: 600,
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
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
