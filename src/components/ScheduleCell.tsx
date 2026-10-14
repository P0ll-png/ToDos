/**
 * ScheduleCell — a single subject rendered as a real <button> inside the
 * schedule grid. Keyboard-focusable with the global :focus-visible ring
 * (--focus-ring). Clicking it selects the subject.
 *
 * Glow is DERIVED (never stored): the `pending` prop is computed by the grid
 * via subjectGlows (viewer-dependent) over the live tasks array; when set the
 * cell shows an amber border + soft box-shadow halo AND a ringed dot badge.
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
  /**
   * True when the subject has a quiz/exam/presentation within 7 days
   * (hasUpcomingAssessment). Rendered as a corner marker DISTINCT in shape,
   * icon, and token (--assess-badge) from the round pending dot, with its own
   * sr-only label, so it never reads as the pending glow (FR-1.9).
   */
  assessment?: boolean;
  selected: boolean;
  onSelect: (subjectId: string) => void;
}

export function ScheduleCell({
  subject,
  pending,
  assessment = false,
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
      {assessment && (
        <span
          // A triangular warning marker in --assess-badge — a different SHAPE
          // (triangle, not a round dot), icon, and token, placed in the opposite
          // (bottom-right) corner so it never reads as the pending glow.
          aria-hidden="true"
          data-testid="assessment-badge"
          style={{
            position: 'absolute',
            bottom: '0.375rem',
            right: '0.375rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 0,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="var(--assess-badge)"
            stroke="var(--assess-badge-fg)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M12 2 2 21h20L12 2z" />
            <line x1="12" y1="9" x2="12" y2="14" stroke="var(--assess-badge-fg)" />
            <line x1="12" y1="18" x2="12" y2="18" stroke="var(--assess-badge-fg)" />
          </svg>
        </span>
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
      {assessment && <span className="sr-only"> (assessment within 7 days)</span>}
    </button>
  );
}
