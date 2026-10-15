/**
 * DetailsPanel — for the selected subject, lists ONLY that subject's PENDING
 * tasks (title, note, date given, deadline), sorted nearest-deadline-first via
 * sorting.ts. Overdue pending tasks are flagged with --danger (viewer-local
 * date via localTodayISO). Empty states: no selection, and selected-with-no-
 * pending. If the selected subject was deleted (not in `subjects`), the parent
 * clears selection; here we also render the no-selection state defensively.
 */
import { useMemo } from 'react';
import type { CalendarItem, EventItem, EventType, Subject, Task } from '../lib/types';
import { isOverdue, formatDeadline } from '../lib/derive';
import { sortByDeadline } from '../lib/sorting';
import { EventBadge } from './EventBadge';

interface DetailsPanelProps {
  subjects: Subject[];
  tasks: Task[];
  events?: EventItem[];
  selectedSubjectId: string | null;
  /**
   * Month-calendar day mode (optional). When selectedDay is set, the panel
   * lists that day's merged items (dayItems) instead of the selected subject's
   * pending tasks. The weekly view leaves these undefined and keeps the
   * original subject-details behavior unchanged.
   */
  selectedDay?: string | null;
  dayItems?: CalendarItem[];
  /** The signed-in viewer's own completed event ids (day mode only). */
  completedEventIds?: Set<string>;
  /** Whether the viewer is signed in (gates the event done indicator). */
  signedIn?: boolean;
}

export function DetailsPanel({
  subjects,
  tasks,
  events = [],
  selectedSubjectId,
  selectedDay = null,
  dayItems = [],
  completedEventIds = new Set(),
  signedIn = false,
}: DetailsPanelProps) {
  // Month-calendar day mode takes precedence when a day is selected.
  if (selectedDay !== null) {
    return (
      <section aria-label="Day details" className="card" style={sectionStyle}>
        <h2 style={headingStyle}>{selectedDay}</h2>
        {dayItems.length === 0 ? (
          <p className="muted" style={{ color: 'var(--muted)' }}>
            Nothing scheduled for this day.
          </p>
        ) : (
          <ul style={listStyle}>
            {dayItems.map((item) => {
              const eventDoneForMe =
                item.kind === 'event' &&
                signedIn &&
                completedEventIds.has(item.id);
              const done =
                (item.kind === 'task' && item.done) || eventDoneForMe;
              return (
                <li key={`${item.kind}:${item.id}`} style={itemStyle}>
                  <div style={titleRowStyle}>
                    {item.kind === 'event' ? (
                      <EventBadge type={item.type as EventType} />
                    ) : null}
                    <span
                      style={{
                        fontWeight: 600,
                        ...(done
                          ? { color: 'var(--task-done)', textDecoration: 'line-through' }
                          : null),
                      }}
                    >
                      {item.title}
                      {done && <span className="sr-only"> (done)</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <DetailsPanelSubject
      subjects={subjects}
      tasks={tasks}
      events={events}
      selectedSubjectId={selectedSubjectId}
    />
  );
}

/** 'HH:MM:SS' / 'HH:MM' -> 'HH:MM'. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

function DetailsPanelSubject({
  subjects,
  tasks,
  events,
  selectedSubjectId,
}: {
  subjects: Subject[];
  tasks: Task[];
  events: EventItem[];
  selectedSubjectId: string | null;
}) {
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

  const subjectEvents = useMemo(() => {
    if (!subject) return [];
    return events
      .filter((e) => e.subjectId === subject.id)
      .sort((a, b) => {
        if (a.eventDate !== b.eventDate) {
          return a.eventDate < b.eventDate ? -1 : 1;
        }
        // null startTime sorts last.
        if (a.startTime === b.startTime) return 0;
        if (a.startTime === null) return 1;
        if (b.startTime === null) return -1;
        return a.startTime < b.startTime ? -1 : 1;
      });
  }, [subject, events]);

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

      <h3 style={groupHeadingStyle}>Pending tasks</h3>
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

      <h3 style={groupHeadingStyle}>Events</h3>
      {subjectEvents.length === 0 ? (
        <p className="muted" style={{ color: 'var(--muted)' }}>
          No events for this subject.
        </p>
      ) : (
        <ul style={listStyle}>
          {subjectEvents.map((ev) => {
            const timeLabel =
              ev.startTime == null
                ? ''
                : ev.endTime == null
                  ? ` · ${hhmm(ev.startTime)}`
                  : ` · ${hhmm(ev.startTime)}–${hhmm(ev.endTime)}`;
            return (
              <li key={ev.id} style={itemStyle}>
                <div style={titleRowStyle}>
                  <span style={eventTitleRowStyle}>
                    <EventBadge type={ev.type} />
                    <span style={{ fontWeight: 600 }}>{ev.title}</span>
                  </span>
                </div>
                <p
                  className="muted"
                  style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted)' }}
                >
                  {ev.eventDate}
                  {timeLabel}
                  {ev.location ? ` · ${ev.location}` : ''}
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

const groupHeadingStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: 'var(--muted)',
  margin: '1rem 0 0.5rem',
};

const eventTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
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
