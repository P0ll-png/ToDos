/**
 * ContrastWarning — a small, token-styled inline notice shown in the Appearance
 * panel when a user's color choice can't meet WCAG AA. Two uses:
 *  - accent-as-link-text fell back to --text (adjustForAA exhausted its steps);
 *  - a bg/surface tint drops --text below AA, offering a one-click discard.
 *
 * It is role="status" (polite) rather than role="alert": these are advisory,
 * the UI stays usable, and nothing is blocked.
 */
import type { ReactNode } from 'react';

interface ContrastWarningProps {
  children: ReactNode;
  /** Optional one-click remediation (e.g. "Discard tint"). */
  action?: { label: string; onClick: () => void };
}

export function ContrastWarning({ children, action }: ContrastWarningProps) {
  return (
    <div role="status" style={wrapStyle}>
      <p style={{ margin: 0 }}>{children}</p>
      {action && (
        <button type="button" onClick={action.onClick} style={actionStyle}>
          {action.label}
        </button>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.5rem 0.625rem',
  marginTop: '0.5rem',
  border: '1px solid var(--danger)',
  borderRadius: 'calc(var(--radius) - 6px)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: '0.8125rem',
};

const actionStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '0.25rem 0.5rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 8px)',
  fontWeight: 500,
};
