/**
 * CalendarField — an accessible custom calendar popover for picking a single
 * date. A trigger <button> shows the current selection and opens a month-grid
 * popover of real day <button>s. Keyboard: arrows move by day/week, PageUp/Down
 * change month, Home/End jump to row ends, Enter/Space select, Escape closes.
 * Focus moves into the grid on open and returns to the trigger on close.
 *
 * Value contract: a zero-padded 'YYYY-MM-DD' string, or '' when unset. onChange
 * emits that shape. All colors come from CSS tokens; no hardcoded colors.
 *
 * Time is NOT handled here (date only) — the deadline's time uses a separate
 * <input type="time"> in AddTaskDialog.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { localTodayISO } from '../lib/derive';

interface CalendarFieldProps {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (next: string) => void;
  /** Accessible label for the trigger, e.g. "Date given". */
  label: string;
  /** Placeholder shown on the trigger when unset. */
  placeholder?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseYMD(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function ymd(date: Date): string {
  return localTodayISO(date);
}

/** Human-readable trigger label, e.g. 'Oct 8, 2026'. */
function prettyDate(value: string): string {
  const p = parseYMD(value);
  if (!p) return '';
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function CalendarField({
  value,
  onChange,
  label,
  placeholder = 'Select a date',
}: CalendarFieldProps) {
  const [open, setOpen] = useState(false);
  // The month currently shown in the grid, and the focused day within it.
  const initial = parseYMD(value);
  const today = parseYMD(localTodayISO())!;
  const [viewYear, setViewYear] = useState(initial?.y ?? today.y);
  const [viewMonth, setViewMonth] = useState((initial?.m ?? today.m) - 1); // 0-based
  const [focusedDay, setFocusedDay] = useState(initial?.d ?? today.d);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun

  // When opening, sync the view to the selected value (or today) and focus grid.
  function openPopover() {
    const p = parseYMD(value) ?? today;
    setViewYear(p.y);
    setViewMonth(p.m - 1);
    setFocusedDay(p.d);
    setOpen(true);
  }

  function closePopover(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  // Move focus to the active day cell whenever the focused day / month changes.
  useLayoutEffect(() => {
    if (!open) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-day="${focusedDay}"]`,
    );
    el?.focus();
  }, [open, focusedDay, viewMonth, viewYear]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        closePopover(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function clampDay(year: number, month: number, day: number): number {
    const max = new Date(year, month + 1, 0).getDate();
    return Math.min(day, max);
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
    setFocusedDay((d) => clampDay(y, m, d));
  }

  function moveFocus(deltaDays: number) {
    const target = new Date(viewYear, viewMonth, focusedDay + deltaDays);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    setFocusedDay(target.getDate());
  }

  function selectDay(day: number) {
    onChange(ymd(new Date(viewYear, viewMonth, day)));
    closePopover();
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-7);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(7);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(-(((focusedDay - 1 + firstWeekday) % 7)));
        break;
      case 'End':
        e.preventDefault();
        moveFocus(6 - ((focusedDay - 1 + firstWeekday) % 7));
        break;
      case 'PageUp':
        e.preventDefault();
        changeMonth(-1);
        break;
      case 'PageDown':
        e.preventDefault();
        changeMonth(1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectDay(focusedDay);
        break;
      case 'Escape':
        e.preventDefault();
        closePopover();
        break;
      default:
        break;
    }
  }

  const selected = parseYMD(value);
  const triggerLabel = value ? prettyDate(value) : placeholder;

  // Build the grid cells: leading blanks for the first-weekday offset, then days.
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? closePopover() : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${label}: ${prettyDate(value)}` : label}
        style={triggerStyle(Boolean(value))}
      >
        <CalendarIcon />
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelId}
          className="calendar-popover"
        >
          <div style={navRowStyle}>
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
              style={navButtonStyle}
            >
              ‹
            </button>
            <span id={labelId} style={{ fontWeight: 600 }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Next month"
              style={navButtonStyle}
            >
              ›
            </button>
          </div>

          <div style={weekdayRowStyle} aria-hidden="true">
            {WEEKDAYS.map((w) => (
              <span key={w} style={weekdayCellStyle}>
                {w}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}
            onKeyDown={onGridKeyDown}
            style={gridStyle}
          >
            {cells.map((day, i) => {
              if (day === null) {
                return <span key={`blank-${i}`} aria-hidden="true" />;
              }
              const isSelected =
                selected != null &&
                selected.y === viewYear &&
                selected.m === viewMonth + 1 &&
                selected.d === day;
              const isToday =
                today.y === viewYear &&
                today.m === viewMonth + 1 &&
                today.d === day;
              const isFocusTarget = day === focusedDay;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  data-day={day}
                  aria-selected={isSelected}
                  tabIndex={isFocusTarget ? 0 : -1}
                  onClick={() => selectDay(day)}
                  style={dayStyle(isSelected, isToday)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function triggerStyle(hasValue: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.5rem 0.625rem',
    background: 'var(--bg)',
    color: hasValue ? 'var(--text)' : 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 'calc(var(--radius) - 4px)',
    font: 'inherit',
    textAlign: 'left',
  };
}

const navRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.5rem',
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

const weekdayRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '0.125rem',
  marginBottom: '0.25rem',
};

const weekdayCellStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: 'var(--muted)',
  padding: '0.25rem 0',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '0.125rem',
};

function dayStyle(selected: boolean, today: boolean): React.CSSProperties {
  return {
    aspectRatio: '1 / 1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    fontSize: '0.8125rem',
    background: selected ? 'var(--accent)' : 'transparent',
    color: selected ? 'var(--accent-contrast)' : 'var(--text)',
    border: today && !selected ? '1px solid var(--accent)' : '1px solid transparent',
    borderRadius: 'calc(var(--radius) - 6px)',
    fontWeight: selected ? 600 : 400,
  };
}
