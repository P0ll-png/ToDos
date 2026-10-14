/**
 * StatusBadge — the shared pill for an absence request's status
 * (pending / acknowledged / needs_followup). It carries an icon AND a text
 * label alongside the token background, so the status is never conveyed by
 * color alone (WCAG). Colors come only from the --status-* tokens defined in
 * tokens.css for both modes.
 */
import type { AbsenceStatus } from '../lib/types';

interface StatusMeta {
  label: string;
  bg: string;
  fg: string;
  Icon: () => JSX.Element;
}

const CLOCK = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 16 14" />
  </svg>
);

const CHECK = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ALERT = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 3 2 20h20L12 3z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12" y2="17" />
  </svg>
);

const META: Record<AbsenceStatus, StatusMeta> = {
  pending: {
    label: 'Pending',
    bg: 'var(--status-pending)',
    fg: 'var(--status-pending-fg)',
    Icon: CLOCK,
  },
  acknowledged: {
    label: 'Acknowledged',
    bg: 'var(--status-ack)',
    fg: 'var(--status-ack-fg)',
    Icon: CHECK,
  },
  needs_followup: {
    label: 'Needs follow-up',
    bg: 'var(--status-followup)',
    fg: 'var(--status-followup-fg)',
    Icon: ALERT,
  },
};

export function StatusBadge({ status }: { status: AbsenceStatus }) {
  const meta = META[status];
  const { Icon } = meta;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.15rem 0.5rem',
        background: meta.bg,
        color: meta.fg,
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      <Icon />
      {meta.label}
    </span>
  );
}
