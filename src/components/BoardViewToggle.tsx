/**
 * BoardViewToggle — the "Weekly schedule | Month calendar" segmented toggle
 * shown above the left column. State lives in Layout; the details panel and the
 * right-hand list are unchanged by the toggle. Two real <button>s with
 * aria-pressed on the active view and the global focus ring.
 */
export type BoardView = 'weekly' | 'month';

interface BoardViewToggleProps {
  view: BoardView;
  onChange: (view: BoardView) => void;
}

export function BoardViewToggle({ view, onChange }: BoardViewToggleProps) {
  return (
    <div role="group" aria-label="Board view" style={rowStyle}>
      <button
        type="button"
        onClick={() => onChange('weekly')}
        aria-pressed={view === 'weekly'}
        style={view === 'weekly' ? activeStyle : baseStyle}
      >
        Weekly schedule
      </button>
      <button
        type="button"
        onClick={() => onChange('month')}
        aria-pressed={view === 'month'}
        style={view === 'month' ? activeStyle : baseStyle}
      >
        Month calendar
      </button>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.25rem',
  marginBottom: '0.5rem',
};

const baseStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const activeStyle: React.CSSProperties = {
  ...baseStyle,
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  borderColor: 'var(--accent)',
};
