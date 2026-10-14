/**
 * EventBadge — the type pill shown on an event in the right-hand list and on a
 * month-calendar chip. It carries a token background, a paired inline SVG icon
 * (Header icon style), AND a text label, so event type is NEVER conveyed by
 * color alone (FR-1.8). Each type maps to a distinct --ev-* background token and
 * its readable --ev-*-fg foreground (AA-guarded in palette-ext-aa.test.ts).
 *
 * Icons by type: school_event = calendar-star, quiz = clipboard-question,
 * exam = document-check, presentation = presentation-screen.
 */
import type { CSSProperties } from 'react';
import type { EventType } from '../lib/types';

interface EventBadgeProps {
  type: EventType;
  /** Compact variant for calendar chips (smaller padding/font). */
  compact?: boolean;
}

const LABELS: Record<EventType, string> = {
  school_event: 'School event',
  quiz: 'Quiz',
  exam: 'Exam',
  presentation: 'Presentation',
};

const TOKENS: Record<EventType, { bg: string; fg: string }> = {
  school_event: { bg: 'var(--ev-school)', fg: 'var(--ev-school-fg)' },
  quiz: { bg: 'var(--ev-quiz)', fg: 'var(--ev-quiz-fg)' },
  exam: { bg: 'var(--ev-exam)', fg: 'var(--ev-exam-fg)' },
  presentation: { bg: 'var(--ev-pres)', fg: 'var(--ev-pres-fg)' },
};

export function EventBadge({ type, compact = false }: EventBadgeProps) {
  const { bg, fg } = TOKENS[type];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: compact ? '0.0625rem 0.3125rem' : '0.125rem 0.5rem',
    borderRadius: '999px',
    background: bg,
    color: fg,
    fontSize: compact ? '0.6875rem' : '0.75rem',
    fontWeight: 600,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  };
  return (
    <span style={style} data-testid={`event-badge-${type}`}>
      <EventIcon type={type} />
      <span>{LABELS[type]}</span>
    </span>
  );
}

/** The per-type inline icon. Decorative (aria-hidden) — the label carries meaning. */
function EventIcon({ type }: { type: EventType }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false as const,
  };
  switch (type) {
    case 'school_event':
      // calendar-star
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M12 13l1.03 2.09 2.3.33-1.66 1.62.39 2.29L12 18.73l-2.06 1.08.39-2.29-1.66-1.62 2.3-.33z" />
        </svg>
      );
    case 'quiz':
      // clipboard-question
      return (
        <svg {...common}>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M10 11a2 2 0 1 1 3 1.73c-.6.37-1 .83-1 1.52" />
          <line x1="12" y1="17" x2="12" y2="17" />
        </svg>
      );
    case 'exam':
      // document-check
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <polyline points="9 15 11 17 15 13" />
        </svg>
      );
    case 'presentation':
      // presentation-screen
      return (
        <svg {...common}>
          <path d="M2 3h20" />
          <path d="M3 3v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V3" />
          <line x1="12" y1="15" x2="12" y2="21" />
          <line x1="9" y1="21" x2="15" y2="21" />
        </svg>
      );
    default:
      return null;
  }
}
