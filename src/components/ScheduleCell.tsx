/**
 * ScheduleCell — a single subject rendered as a real <button> inside the
 * schedule grid. Keyboard-focusable with the global :focus-visible ring
 * (--focus-ring). Clicking it selects the subject.
 *
 * Glow is DERIVED (never stored): when the subject has >= 1 pending task
 * (`pending` prop, computed by the grid via subjectHasPending over the live
 * tasks array) the cell shows an amber border + soft box-shadow halo AND a
 * ringed dot badge.
 *
 * Fix #6 — the glow halo uses --accent-weak (~22% alpha of the accent) and is
 * purely COSMETIC: it is NOT the accessibility signal, so no contrast check is
 * required on --accent-weak. The non-color pending cue is the ringed dot
 * badge (an --accent fill with a 1px --dot-ring = --text ring); the --text ring
 * is guaranteed to contrast with --surface, so the dot's shape survives any
 * accent and carries the "pending" meaning without relying on color alone.
 */
import type { CSSProperties } from 'react';
import type { Subject } from '../lib/types';

interface ScheduleCellProps {
  subject: Subject;
  pending: boolean;
  selected: boolean;
  onSelect: (subjectId: string) => void;
}

export function ScheduleCell({
  subject,
  pending,
  selected,
  onSelect,
}: ScheduleCellProps) {
  const style: CSSProperties = {
    position: 'relative',
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.5rem 0.625rem',
    background: selected ? 'var(--surface-2)' : 'var(--surface)',
    color: 'var(--text)',
    border: `1px solid ${pending ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'calc(var(--radius) - 4px)',
    // Cosmetic halo only (fix #6) — not an accessibility property.
    boxShadow: pending ? '0 0 0 3px var(--accent-weak)' : 'none',
    fontWeight: selected ? 600 : 500,
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(subject.id)}
      aria-pressed={selected}
      style={style}
    >
      {pending && (
        <span
          // The ringed dot is the non-color pending cue (fix #6): --accent fill
          // + 1px --dot-ring (=--text) ring, so its silhouette is always visible.
          aria-hidden="true"
          data-testid="pending-dot"
          style={{
            position: 'absolute',
            top: '0.375rem',
            right: '0.375rem',
            width: '0.5rem',
            height: '0.5rem',
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 0 1px var(--dot-ring)',
          }}
        />
      )}
      <span style={{ display: 'block' }}>{subject.name}</span>
      {subject.room && (
        <span
          className="muted"
          style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}
        >
          {subject.room}
        </span>
      )}
      {pending && <span className="sr-only"> (has pending tasks)</span>}
    </button>
  );
}
