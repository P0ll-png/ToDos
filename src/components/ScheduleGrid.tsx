/**
 * ScheduleGrid — the weekly class schedule. Columns are Mon–Sat (day 1..6);
 * rows are the distinct time blocks derived from schedule_slots start/end.
 * Each occupied slot renders a ScheduleCell (a real <button>). Glow is DERIVED
 * from the live tasks array via subjectHasPending — never stored.
 *
 * Zero-slots empty state is first-class because the user seeds subjects/slots
 * directly in Supabase.
 */
import { useMemo } from 'react';
import type { ScheduleSlot, Subject, Task } from '../lib/types';
import { subjectHasPending } from '../lib/derive';
import { ScheduleCell } from './ScheduleCell';

const DAYS: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];

interface ScheduleGridProps {
  subjects: Subject[];
  slots: ScheduleSlot[];
  tasks: Task[];
  selectedSubjectId: string | null;
  onSelectSubject: (subjectId: string) => void;
}

/** 'HH:MM:SS' / 'HH:MM' -> 'HH:MM' for display. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function ScheduleGrid({
  subjects,
  slots,
  tasks,
  selectedSubjectId,
  onSelectSubject,
}: ScheduleGridProps) {
  const subjectById = useMemo(() => {
    const map = new Map<string, Subject>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  // Distinct time blocks (rows), ordered by start then end. Both are 'HH:MM:SS'
  // strings so lexicographic order is correct.
  const timeBlocks = useMemo(() => {
    const seen = new Map<string, { startTime: string; endTime: string }>();
    for (const slot of slots) {
      const key = `${slot.startTime}|${slot.endTime}`;
      if (!seen.has(key)) {
        seen.set(key, { startTime: slot.startTime, endTime: slot.endTime });
      }
    }
    return [...seen.values()].sort((a, b) =>
      a.startTime !== b.startTime
        ? a.startTime < b.startTime
          ? -1
          : 1
        : a.endTime < b.endTime
          ? -1
          : a.endTime > b.endTime
            ? 1
            : 0,
    );
  }, [slots]);

  // (timeBlockKey, day) -> slot, for O(1) cell lookup.
  const slotAt = useMemo(() => {
    const map = new Map<string, ScheduleSlot>();
    for (const slot of slots) {
      map.set(`${slot.startTime}|${slot.endTime}|${slot.day}`, slot);
    }
    return map;
  }, [slots]);

  if (slots.length === 0) {
    return (
      <section aria-label="Weekly schedule" className="card" style={sectionStyle}>
        <h2 style={headingStyle}>Schedule</h2>
        <p className="muted" style={{ color: 'var(--muted)' }}>
          No schedule yet — an officer can add subjects in Supabase.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Weekly schedule" className="card" style={sectionStyle}>
      <h2 style={headingStyle}>Schedule</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th scope="col" style={timeHeadStyle}>
                Time
              </th>
              {DAYS.map((d) => (
                <th key={d.day} scope="col" style={dayHeadStyle}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeBlocks.map((block) => {
              const blockKey = `${block.startTime}|${block.endTime}`;
              return (
                <tr key={blockKey}>
                  <th scope="row" style={timeCellStyle}>
                    {hhmm(block.startTime)}–{hhmm(block.endTime)}
                  </th>
                  {DAYS.map((d) => {
                    const slot = slotAt.get(`${blockKey}|${d.day}`);
                    const subject = slot
                      ? subjectById.get(slot.subjectId)
                      : undefined;
                    return (
                      <td key={d.day} style={cellStyle}>
                        {subject ? (
                          <ScheduleCell
                            subject={subject}
                            pending={subjectHasPending(subject.id, tasks)}
                            selected={subject.id === selectedSubjectId}
                            onSelect={onSelectSubject}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

const tableStyle: React.CSSProperties = {
  borderCollapse: 'separate',
  borderSpacing: '0.375rem',
  width: '100%',
  minWidth: '36rem',
};

const dayHeadStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--muted)',
  fontSize: '0.8125rem',
  fontWeight: 600,
  padding: '0.25rem',
};

const timeHeadStyle: React.CSSProperties = {
  ...dayHeadStyle,
  textAlign: 'left',
};

const timeCellStyle: React.CSSProperties = {
  textAlign: 'left',
  color: 'var(--muted)',
  fontSize: '0.75rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
  padding: '0.5rem 0.25rem',
};

const cellStyle: React.CSSProperties = {
  verticalAlign: 'top',
  minWidth: '6rem',
};
