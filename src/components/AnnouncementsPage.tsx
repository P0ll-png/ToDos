/**
 * AnnouncementsPage — the public Announcements board (FEAT-001).
 *
 * Read is PUBLIC: anonymous and member visitors see the newest-first list, so
 * there is deliberately NO SignInGate (the DB also grants anon select on
 * announcements). Only officers see the inline compose form and the per-item
 * Delete button; those controls are convenience only — RLS
 * (announcements_insert / announcements_delete with is_officer()) is the real
 * authorization boundary and mutations.ts never checks a client role.
 *
 * Follows the ReviewersPage/AbsencesPage full-page template: a centered
 * section, the status/retry contract from useAnnouncements, token-only colors,
 * and real <button>s relying on the global :focus-visible ring. Timestamps are
 * compared lexically (ISO strings) — never through new Date().
 */
import { useState } from 'react';
import { useSession } from '../context/SessionProvider';
import { useAnnouncements } from '../data/useAnnouncements';
import {
  addAnnouncement,
  removeAnnouncement,
  MUTATION_MESSAGES,
  type MutationError,
} from '../data/mutations';
import type { Announcement } from '../lib/types';

const TITLE_MAX = 200;
const BODY_MAX = 2000;

export function AnnouncementsPage() {
  const { isOfficer, profile } = useSession();
  const { data, status, retry } = useAnnouncements();

  // Newest first by created_at. Lexical ISO compare — never new Date().
  const items = [...data].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );

  return (
    <section style={pageStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0 }}>Announcements</h2>
      </div>

      {isOfficer && (
        <ComposeForm authorId={profile?.id ?? null} onPosted={retry} />
      )}

      {status === 'loading' && <p style={mutedStyle}>Loading announcements…</p>}
      {status === 'error' && <ErrorState onRetry={retry} />}
      {status === 'ready' && (
        <AnnouncementList
          items={items}
          isOfficer={isOfficer}
          onChanged={retry}
        />
      )}
    </section>
  );
}

function ComposeForm({
  authorId,
  onPosted,
}: {
  authorId: string | null;
  onPosted: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<MutationError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await addAnnouncement({
      title: trimmedTitle,
      body: body.trim(),
      createdBy: authorId,
    });
    setSubmitting(false);
    if (result.ok) {
      setTitle('');
      setBody('');
      onPosted();
    } else {
      setError(result.error ?? 'network');
    }
  };

  return (
    <form onSubmit={onSubmit} style={formStyle}>
      <label style={labelStyle}>
        <span>Title</span>
        <input
          type="text"
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's the announcement?"
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span>Details</span>
        <textarea
          rows={3}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add any details (optional)"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      {error && (
        <p role="alert" style={errorTextStyle}>
          {MUTATION_MESSAGES[error]}
        </p>
      )}
      <div>
        <button type="submit" disabled={submitting} style={accentButtonStyle}>
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}

function AnnouncementList({
  items,
  isOfficer,
  onChanged,
}: {
  items: Announcement[];
  isOfficer: boolean;
  onChanged: () => void;
}) {
  if (items.length === 0) {
    return <p style={mutedStyle}>No announcements yet.</p>;
  }
  return (
    <ul style={listStyle}>
      {items.map((item) => (
        <AnnouncementItem
          key={item.id}
          item={item}
          isOfficer={isOfficer}
          onChanged={onChanged}
        />
      ))}
    </ul>
  );
}

function AnnouncementItem({
  item,
  isOfficer,
  onChanged,
}: {
  item: Announcement;
  isOfficer: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<MutationError | null>(null);
  const [deleting, setDeleting] = useState(false);

  const onDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    const result = await removeAnnouncement(item.id);
    setDeleting(false);
    if (result.ok) {
      onChanged();
    } else {
      setError(result.error ?? 'network');
    }
  };

  return (
    <li style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{item.title}</h3>
        {isOfficer && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`Delete announcement ${item.title}`}
            style={deleteButtonStyle}
          >
            Delete
          </button>
        )}
      </div>
      {item.body && <p style={bodyStyle}>{item.body}</p>}
      <p style={metaStyle}>
        {item.authorName ?? 'Unknown'}
        {item.createdAt ? ` · ${item.createdAt}` : ''}
      </p>
      {error && (
        <p role="alert" style={errorTextStyle}>
          {MUTATION_MESSAGES[error]}
        </p>
      )}
    </li>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ color: 'var(--text)' }}>
      <p style={mutedStyle}>Couldn't load announcements.</p>
      <button type="button" onClick={onRetry} style={retryButtonStyle}>
        Retry
      </button>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: '60rem',
  margin: '0 auto',
  padding: '1.5rem 1rem',
  color: 'var(--text)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  flexWrap: 'wrap',
  marginBottom: '1rem',
};

const mutedStyle: React.CSSProperties = {
  color: 'var(--muted)',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  padding: '1rem',
  marginBottom: '1.5rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.65rem',
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  font: 'inherit',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '0.75rem',
};

const bodyStyle: React.CSSProperties = {
  margin: '0.5rem 0 0',
  color: 'var(--text)',
  whiteSpace: 'pre-wrap',
};

const metaStyle: React.CSSProperties = {
  margin: '0.5rem 0 0',
  color: 'var(--muted)',
  fontSize: '0.85rem',
};

const errorTextStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--danger)',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '0.35rem 0.7rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const retryButtonStyle: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
