/**
 * ReviewerGrid — a responsive card grid of shared reviewers with client-side
 * controls over the already-fetched rows (FR-5.7):
 *  - filter by subject <select>;
 *  - search by title (case-insensitive substring);
 *  - sort by newest (created_at desc) — the only sort offered.
 *
 * When the filtered set is empty it renders a contextual empty state (distinct
 * copy for "nothing uploaded yet" vs "nothing matches your filters"). The grid
 * itself is a token-driven CSS-grid that reflows by available width.
 */
import { useMemo, useState } from 'react';
import type { Reviewer, Subject } from '../lib/types';
import { ReviewerCard } from './ReviewerCard';

interface ReviewerGridProps {
  reviewers: Reviewer[];
  subjects: Subject[];
  /** Refetch the grid after a successful delete. */
  onChanged: () => void;
}

export function ReviewerGrid({ reviewers, subjects, onChanged }: ReviewerGridProps) {
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviewers
      .filter((r) => {
        if (subjectFilter !== 'all' && r.subjectId !== subjectFilter) {
          return false;
        }
        if (q && !r.title.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        // Newest first. created_at is an ISO string, so a descending string
        // compare orders newest -> oldest; a null date sorts last.
        const av = a.createdAt ?? '';
        const bv = b.createdAt ?? '';
        if (av === bv) return 0;
        if (av === '') return 1;
        if (bv === '') return -1;
        return av < bv ? 1 : -1;
      });
  }, [reviewers, subjectFilter, search]);

  const noneAtAll = reviewers.length === 0;

  return (
    <div>
      <div style={controlsStyle}>
        <label style={controlLabelStyle}>
          Subject
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...controlLabelStyle, flex: 1, minWidth: '12rem' }}>
          Search
          <input
            type="search"
            value={search}
            placeholder="Search by title"
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
        </label>
        <p style={sortNoteStyle}>Sorted by newest</p>
      </div>

      {visible.length === 0 ? (
        <p style={emptyStyle}>
          {noneAtAll
            ? 'No reviewers yet. Upload one to share it with the class.'
            : 'No reviewers match your filters.'}
        </p>
      ) : (
        <ul style={gridStyle}>
          {visible.map((r) => (
            <ReviewerCard
              key={r.id}
              reviewer={r}
              subjects={subjects}
              onDeleted={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const controlsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  gap: '0.75rem',
  marginBottom: '1rem',
};

const controlLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.8125rem',
  color: 'var(--muted)',
};

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.55rem',
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  font: 'inherit',
  fontSize: '0.875rem',
};

const sortNoteStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--muted)',
  fontSize: '0.8125rem',
};

const gridStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
  gap: '0.9rem',
};

const emptyStyle: React.CSSProperties = {
  color: 'var(--muted)',
  padding: '2rem 0',
  textAlign: 'center',
};
