/**
 * DateSelect — a Day / Month / Year triple-dropdown date picker. A convenience
 * alternative to the native <input type="date"> that is consistent across every
 * browser and needs no OS picker.
 *
 * Contract: the value is a zero-padded 'YYYY-MM-DD' string (the format the whole
 * app compares lexicographically — see derive.ts), or '' when unset. onChange
 * emits that same shape. All three controls are real <select> elements with the
 * global focus ring.
 *
 * - The Day options adapt to the selected month/year (28–31, leap-year aware),
 *   so Feb 30 can't be chosen; if the current day is invalid after a month/year
 *   change it clamps down to the last valid day.
 * - When `optional`, a leading "—" option in each select represents "unset", and
 *   choosing it (or leaving any part blank) yields '' until all three are set.
 */
import { useId } from 'react';

interface DateSelectProps {
  /** Current value as 'YYYY-MM-DD', or '' when unset. */
  value: string;
  onChange: (next: string) => void;
  /** Accessible label prefix for the three controls, e.g. "Date given". */
  label: string;
  /** When true a blank/unset state is allowed (used for the optional deadline). */
  optional?: boolean;
  /** Earliest selectable year. Default: current year − 1. */
  minYear?: number;
  /** Latest selectable year. Default: current year + 3. */
  maxYear?: number;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Days in a given 1-based month of a year (leap-year aware). */
function daysInMonth(year: number, month1: number): number {
  // Day 0 of the next month is the last day of this month.
  return new Date(year, month1, 0).getDate();
}

/** Parse 'YYYY-MM-DD' into numeric parts, or nulls when unset/invalid. */
function parse(value: string): {
  year: number | null;
  month: number | null;
  day: number | null;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return { year: null, month: null, day: null };
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Build 'YYYY-MM-DD' from parts, or '' if any part is missing. */
function build(
  year: number | null,
  month: number | null,
  day: number | null,
): string {
  if (year == null || month == null || day == null) return '';
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function DateSelect({
  value,
  onChange,
  label,
  optional = false,
  minYear,
  maxYear,
}: DateSelectProps) {
  const groupId = useId();
  const now = new Date();
  const lo = minYear ?? now.getFullYear() - 1;
  const hi = maxYear ?? now.getFullYear() + 3;
  const years: number[] = [];
  for (let y = lo; y <= hi; y += 1) years.push(y);

  const { year, month, day } = parse(value);

  // Day options track the selected month/year; fall back to 31 when the month
  // or year isn't chosen yet so the Day select is still usable.
  const maxDay =
    year != null && month != null ? daysInMonth(year, month) : 31;
  const days: number[] = [];
  for (let d = 1; d <= maxDay; d += 1) days.push(d);

  /** Re-emit a value from updated parts, clamping the day to the month length. */
  function emit(
    nextYear: number | null,
    nextMonth: number | null,
    nextDay: number | null,
  ) {
    let d = nextDay;
    if (nextYear != null && nextMonth != null && d != null) {
      const limit = daysInMonth(nextYear, nextMonth);
      if (d > limit) d = limit; // e.g. Jan 31 -> switch to Feb -> clamp to 28/29
    }
    onChange(build(nextYear, nextMonth, d));
  }

  const selStyle: React.CSSProperties = {
    padding: '0.5rem 0.5rem',
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 'calc(var(--radius) - 4px)',
    font: 'inherit',
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }} role="group" aria-label={label}>
      {/* Month */}
      <select
        aria-label={`${label} month`}
        value={month ?? ''}
        onChange={(e) =>
          emit(year, e.target.value === '' ? null : Number(e.target.value), day)
        }
        style={{ ...selStyle, flex: '1 1 auto' }}
        id={`${groupId}-month`}
      >
        <option value="">{optional ? '— Month —' : 'Month'}</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>

      {/* Day */}
      <select
        aria-label={`${label} day`}
        value={day ?? ''}
        onChange={(e) =>
          emit(year, month, e.target.value === '' ? null : Number(e.target.value))
        }
        style={{ ...selStyle, flex: '0 0 4.5rem' }}
        id={`${groupId}-day`}
      >
        <option value="">{optional ? '— Day —' : 'Day'}</option>
        {days.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* Year */}
      <select
        aria-label={`${label} year`}
        value={year ?? ''}
        onChange={(e) =>
          emit(e.target.value === '' ? null : Number(e.target.value), month, day)
        }
        style={{ ...selStyle, flex: '0 0 5.5rem' }}
        id={`${groupId}-year`}
      >
        <option value="">{optional ? '— Year —' : 'Year'}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
