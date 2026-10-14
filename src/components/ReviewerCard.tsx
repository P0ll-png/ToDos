/**
 * ReviewerCard — one shared reviewer in the grid: title, subject, uploader
 * name, upload date, a file-type icon + human-readable size, a Download button,
 * and (for the owner or an officer) a Delete button guarded by a shared-Modal
 * confirm dialog.
 *
 * Download (design OD-5): calls signedUrlFor('reviewers', path,
 * { download: file_name }) and navigates to the returned URL. Supabase Storage
 * sets Content-Disposition: attachment; filename=<file_name> on the signed URL,
 * so the save is forced with the correct name even cross-origin — the anchor
 * `download` attribute is NOT relied upon (it is ignored cross-origin). A
 * per-card busy/error state covers the brief mint latency and a denial.
 *
 * Delete: RLS (rv_delete owner-or-officer + rv_obj_delete) is the real gate;
 * the owner/officer check here only decides whether to SHOW the button. The
 * confirm Modal (focus trap) appears before the destructive call
 * (deleteReviewer removes the object first, then the row — orphan-safe).
 *
 * Colors come only from tokens.
 */
import { useState } from 'react';
import type { Reviewer, Subject } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import {
  MUTATION_MESSAGES,
  SIGNED_URL_MESSAGES,
  deleteReviewer,
  signedUrlFor,
} from '../data/mutations';
import { Modal } from './Modal';

interface ReviewerCardProps {
  reviewer: Reviewer;
  subjects: Subject[];
  /** Refetch the grid after a successful delete. */
  onDeleted: () => void;
}

export function ReviewerCard({ reviewer, subjects, onDeleted }: ReviewerCardProps) {
  const { profile, isOfficer } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete =
    isOfficer || (profile?.id != null && profile.id === reviewer.uploaderId);
  const subjectName =
    subjects.find((s) => s.id === reviewer.subjectId)?.name ?? 'Unknown subject';

  async function handleDownload() {
    setBusy(true);
    setError(null);
    const result = await signedUrlFor('reviewers', reviewer.storagePath, {
      download: reviewer.fileName,
    });
    setBusy(false);
    if (!result.ok) {
      setError(SIGNED_URL_MESSAGES[result.error]);
      return;
    }
    // Storage sets Content-Disposition from the { download } option, so simply
    // navigating forces the save with the correct filename cross-origin.
    window.location.assign(result.url);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteReviewer(reviewer.id, reviewer.storagePath);
    if (result.ok) {
      setConfirming(false);
      setDeleting(false);
      onDeleted();
      return;
    }
    if (result.error) setDeleteError(MUTATION_MESSAGES[result.error]);
    setDeleting(false);
  }

  return (
    <li style={cardStyle}>
      <div style={headStyle}>
        <FileTypeIcon mime={reviewer.mimeType} />
        <div style={{ minWidth: 0 }}>
          <h3 style={titleStyle} title={reviewer.title}>
            {reviewer.title}
          </h3>
          <p style={subjectStyle}>{subjectName}</p>
        </div>
      </div>

      {reviewer.description && (
        <p style={descStyle}>{reviewer.description}</p>
      )}

      <dl style={metaStyle}>
        <div style={metaRowStyle}>
          <dt style={metaKeyStyle}>Uploaded by</dt>
          <dd style={metaValStyle}>{reviewer.uploaderName || 'Unknown'}</dd>
        </div>
        <div style={metaRowStyle}>
          <dt style={metaKeyStyle}>Date</dt>
          <dd style={metaValStyle}>{formatDate(reviewer.createdAt)}</dd>
        </div>
        <div style={metaRowStyle}>
          <dt style={metaKeyStyle}>File</dt>
          <dd style={metaValStyle}>
            {fileLabel(reviewer.mimeType)} · {formatSize(reviewer.sizeBytes)}
          </dd>
        </div>
      </dl>

      <div style={actionsStyle}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          aria-label={`Download ${reviewer.title}`}
          style={accentButtonStyle}
        >
          {busy ? 'Opening…' : 'Download'}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirming(true);
            }}
            aria-label={`Delete ${reviewer.title}`}
            style={dangerButtonStyle}
          >
            Delete
          </button>
        )}
      </div>
      {error && (
        <p role="alert" style={errorTextStyle}>
          {error}
        </p>
      )}

      {confirming && (
        <Modal
          onClose={() => {
            // Ignore scrim/Esc close while a delete is in flight.
            if (!deleting) setConfirming(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reviewer-delete-title"
            className="card"
            style={confirmDialogStyle}
          >
            <h2 id="reviewer-delete-title" style={{ marginTop: 0 }}>
              Delete reviewer?
            </h2>
            <p style={{ color: 'var(--text)' }}>
              "{reviewer.title}" will be removed for everyone. This can't be
              undone.
            </p>
            {deleteError && (
              <p role="alert" style={errorTextStyle}>
                {deleteError}
              </p>
            )}
            <div style={actionsStyle}>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={dangerSolidButtonStyle}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </li>
  );
}

/** A short human label for the five allowed MIME types. */
function fileLabel(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'PDF';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'DOCX';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'PPTX';
    case 'image/jpeg':
      return 'JPG';
    case 'image/png':
      return 'PNG';
    default:
      return 'File';
  }
}

/** Human-readable byte size (KB / MB). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** 'YYYY-MM-DD' date part of the ISO created_at timestamp. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

/** A decorative file-type glyph (aria-hidden; the "File" meta row carries the
 * type in text). A document outline for docs, an image frame for images. */
function FileTypeIcon({ mime }: { mime: string }) {
  const isImage = mime === 'image/jpeg' || mime === 'image/png';
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false as const,
    style: { color: 'var(--muted)', flexShrink: 0 },
  };
  if (isImage) {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '1rem',
  color: 'var(--text)',
};

const headStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.6rem',
  alignItems: 'flex-start',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const subjectStyle: React.CSSProperties = {
  margin: '0.15rem 0 0',
  color: 'var(--muted)',
  fontSize: '0.8125rem',
};

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.875rem',
};

const metaStyle: React.CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  fontSize: '0.8125rem',
};

const metaKeyStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--muted)',
  minWidth: '5.5rem',
};

const metaValStyle: React.CSSProperties = {
  margin: 0,
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginTop: '0.25rem',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '0.45rem 0.8rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '0.45rem 0.8rem',
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const dangerSolidButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'var(--danger)',
  color: 'var(--danger-contrast)',
  border: '1px solid var(--danger)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const confirmDialogStyle: React.CSSProperties = {
  padding: '1.5rem',
  maxWidth: '24rem',
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
};

const errorTextStyle: React.CSSProperties = {
  margin: '0.25rem 0 0',
  color: 'var(--danger)',
  fontSize: '0.8125rem',
};
