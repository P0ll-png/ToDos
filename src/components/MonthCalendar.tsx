/**
 * MonthCalendar — a 7-column, Monday-first month grid (FR-3). Each day is a
 * focusable real <button> (Enter/Space activate via native button semantics,
 * global --focus-ring). It shows up to 3 chips (an EventBadge for events, a
 * compact pill for tasks) plus "+N more" past three (visibleWithOverflow).
 * Prev/next month and a Today button; today's cell is highlighted. Clicking a
 * day calls onSelectDay so Layout can surface that day's items in DetailsPanel.
 *
 * A signed-in user's finished tasks render dimmed (--task-done) on their chip.
 *
 * Responsive (<=640px): the chip stack is replaced by one dot per item (CSS
 * only, via base.css .mc-dots / .mc-chips media query — no JS branch); the
 * tapped day's full item list is shown below the grid by Layout/DetailsPanel.
 */
import { useMemo } from 'react';
import type { CalendarItem, EventItem, Task } from '../lib/types';
import {
  bucketItemsByDay,
  buildMonthGrid,
  mergeCalendarItems,
  visibleWithOverflow,
} from '../lib/calendar';
import { localTodayISO } from '../lib/derive';
import { EventBadge } from './EventBadge';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MonthCalendarProps {
  tasks: Task[];
  events: EventItem[];
  completedTaskIds: Set<string>;
  /** The month shown, as { year, month0 } (0-based month). State lives in Layout. */
  year: number;
  month0: number;
  onChangeMonth: (year: number, month0: number) => void;
  /** The currently selected day ('YYYY-MM-DD') whose items DetailsPanel shows. */
  selectedDay: string | null;
  onSelectDay: (dateYMD: string) => void;
}

export function MonthCalendar({
  tasks,
  events,
  completedTaskIds,
  year,
  month0,
  onChangeMonth,
  selectedDay,
  onSelectDay,
}: MonthCalendarProps) {
  const today = localTodayISO();

  const cells = useMemo(
    () => buildMonthGrid(year, month0, today),
    [year, month0, today],
  );

  const buckets = useMemo(() => {
    const items = mergeCalendarItems(tasks, events, completedTaskIds);
    return bucketItemsByDay(cells, items);
  }, [cells, tasks, events, completedTaskIds]);

  function goPrev() {
    const d = month0 === 0 ? { y: year - 1, m: 11 } : { y: year, m: month0 - 1 };
    onChangeMonth(d.y, d.m);
  }
  function goNext() {
    const d = month0 === 11 ? { y: year + 1, m: 0 } : { y: year, m: month0 + 1 };
    onChangeMonth(d.y, d.m);
  }
  function goToday() {
    const now = new Date();
    onChangeMonth(now.getFullYear(), now.getMonth());
    onSelectDay(localTodayISO(now));
  }

  return (
    <section aria-label="Month calendar" className="card" style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={headingStyle}>
          {MONTH_NAMES[month0]} {year}
        </h2>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            style={navButtonStyle}
          >
            ‹
          </button>
          <button type="button" onClick={goToday} style={todayButtonStyle}>
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            style={navButtonStyle}
          >
            ›
          </button>
        </div>
      </div>

      <div style={weekHeadStyle} aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w} style={weekHeadCellStyle}>
            {w}
          </span>
        ))}
      </div>

      <div role="grid" aria-label={`${MONTH_NAMES[month0]} ${year}`} style={gridStyle}>
        {cells.map((cell) => {
          const items = buckets.get(cell.dateYMD) ?? [];
          const { shown, moreCount } = visibleWithOverflow(items, 3);
          const isSelected = cell.dateYMD === selectedDay;
          return (
            <button
              key={cell.dateYMD}
              type="button"
              role="gridcell"
              onClick={() => onSelectDay(cell.dateYMD)}
              aria-pressed={isSelected}
              aria-label={dayAriaLabel(cell.dateYMD, items)}
              style={cellStyle(cell.inMonth, cell.isToday, isSelected)}
            >
              <span style={dayNumStyle(cell.isToday)}>
                {Number(cell.dateYMD.slice(8, 10))}
              </span>

              {/* Desktop: up to 3 chips + "+N more". */}
              <span className="mc-chips" style={chipStackStyle}>
                {shown.map((item) => (
                  <Chip key={`${item.kind}:${item.id}`} item={item} />
                ))}
                {moreCount > 0 && (
                  <span style={moreStyle}>+{moreCount} more</span>
                )}
              </span>

              {/* Mobile: one dot per item (CSS swaps chips<->dots). */}
              {items.length > 0 && (
                <span className="mc-dots" style={dotRowStyle} aria-hidden="true">
                  {items.map((item) => (
                    <span
                      key={`dot:${item.kind}:${item.id}`}
                      style={dotStyle(item)}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function dayAriaLabel(dateYMD: string, items: CalendarItem[]): string {
  const n = items.length;
  return `${dateYMD}, ${n} item${n === 1 ? '' : 's'}`;
}

/** A single day chip. Events use the EventBadge; tasks a compact pill. */
function Chip({ item }: { item: CalendarItem }) {
  if (item.kind === 'event') {
    return <EventBadge type={item.type as EventItem['type']} compact />;
  }
  // Task chip: dimmed + struck through when the viewer has finished it.
  const done = item.done === true;
  return (
    <span
      style={{
        display: 'block',
        fontSize: '0.6875rem',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(done
          ? { color: 'var(--task-done)', textDecoration: 'line-through' }
          : { color: 'var(--text)' }),
      }}
      title={item.title}
    >
      • {item.title}
      {done && <span className="sr-only"> (done)</span>}
    </span>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--surface)',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  marginBottom: '0.5rem',
};

const headingStyle: React.CSSProperties = {
  fontSize: '1rem',
  margin: 0,
};

const navButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.75rem',
  height: '1.75rem',
  padding: 0,
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontSize: '1.125rem',
  lineHeight: 1,
};

const todayButtonStyle: React.CSSProperties = {
  padding: '0 0.625rem',
  height: '1.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontSize: '0.8125rem',
  fontWeight: 500,
};

const weekHeadStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '0.25rem',
  marginBottom: '0.25rem',
};

const weekHeadCellStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: 'var(--muted)',
  padding: '0.25rem 0',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '0.25rem',
};

function cellStyle(
  inMonth: boolean,
  isToday: boolean,
  selected: boolean,
): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '0.1875rem',
    minHeight: '4.5rem',
    padding: '0.25rem',
    textAlign: 'left',
    background: selected ? 'var(--surface-2)' : 'var(--surface)',
    color: inMonth ? 'var(--text)' : 'var(--muted)',
    border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'calc(var(--radius) - 6px)',
    opacity: inMonth ? 1 : 0.6,
  };
}

function dayNumStyle(isToday: boolean): React.CSSProperties {
  return {
    fontSize: '0.75rem',
    fontWeight: isToday ? 700 : 500,
    color: isToday ? 'var(--accent-text)' : 'inherit',
  };
}

const chipStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
  minWidth: 0,
};

const moreStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--muted)',
  fontWeight: 500,
};

const dotRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.125rem',
};

function dotStyle(item: CalendarItem): React.CSSProperties {
  const bg =
    item.kind === 'event'
      ? eventDotToken(item.type as EventItem['type'])
      : 'var(--accent)';
  return {
    width: '0.375rem',
    height: '0.375rem',
    borderRadius: '50%',
    background: bg,
    boxShadow: '0 0 0 1px var(--dot-ring)',
  };
}

function eventDotToken(type: EventItem['type']): string {
  switch (type) {
    case 'school_event':
      return 'var(--ev-school)';
    case 'quiz':
      return 'var(--ev-quiz)';
    case 'exam':
      return 'var(--ev-exam)';
    case 'presentation':
      return 'var(--ev-pres)';
    default:
      return 'var(--accent)';
  }
}
