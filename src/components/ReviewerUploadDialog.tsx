/**
 * ReviewerUploadDialog — the upload form for a shared reviewer (study file),
 * available to any signed-in user (design FR-5.*). Rendered inside the shared
 * Modal (focus trap + Esc + restore).
 *
 * Fields:
 *  - title (required, trimmed 1–200);
 *  - subject <select> (REQUIRED — a reviewer always belongs to a subject);
 *  - optional description;
 *  - a SINGLE file validated by validateFile(REVIEWER_MIME, REVIEWER_MAX) with
 *    inline type/size errors.
 *
 * Upload progress is an INDETERMINATE indicator only (a spinner + "Uploading…"
 * with the submit disabled) — byte-percent progress is out of scope because
 * @supabase/storage-js 2.45.4 upload() is fetch()-based with no progress
 * callback (design OD-5, Error handling → File upload).
 *
 * Submit flow (createReviewer): the row id is generated with
 * crypto.randomUUID() BEFORE the upload and the path is
 * {uploader_id}/{id}/{safeName} (buildStoragePath), so the object is
 * deterministically locatable from the row and the upload-then-insert is
 * orphan-safe. RLS (rv_insert + rv_obj_insert own-folder) is the real gate.
 */
import { useState, type FormEvent } from 'react';
import type { Subject } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import {
  REVIEWER_MAX,
  REVIEWER_MIME,
  buildStoragePath,
  validateFile,
} from '../lib/storage';
import { MUTATION_MESSAGES, createReviewer } from '../data/mutations';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

interface ReviewerUploadDialogProps {
  subjects: Subject[];
  onClose: () => void;
  /** Called after a successful upload so the parent can refetch/close. */
  onUploaded: () => void;
}

export function ReviewerUploadDialog({
  subjects,
  onClose,
  onUploaded,
}: ReviewerUploadDialogProps) {
  const { profile } = useSession();
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedTitle = title.trim();
  const titleValid = trimmedTitle.length >= 1 && trimmedTitle.length <= TITLE_MAX;
  const subjectValid = subjectId !== '';
  const canSubmit =
    titleValid &&
    subjectValid &&
    file != null &&
    fileError == null &&
    !busy &&
    Boolean(profile?.id);

  function onFilePicked(fileList: FileList | null) {
    setFileError(null);
    const picked = fileList?.[0] ?? null;
    if (!picked) {
      setFile(null);
      return;
    }
    const result = validateFile(
      { type: picked.type, size: picked.size, name: picked.name },
      REVIEWER_MIME,
      REVIEWER_MAX,
    );
    if (!result.ok) {
      setFileError(
        result.reason === 'type'
          ? 'PDF, DOCX, PPTX, JPG or PNG only.'
          : 'Max 20 MB.',
      );
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !profile || !file) return;
    setBusy(true);
    setError(null);

    // Generate the row id BEFORE the upload so the object path is deterministic
    // from the row ({uploader_id}/{id}/{safeName}).
    const id = crypto.randomUUID();
    const path = buildStoragePath(profile.id, id, file.name);
    const result = await createReviewer({
      id,
      uploaderId: profile.id,
      subjectId,
      title: trimmedTitle,
      description: description.trim() === '' ? undefined : description.trim(),
      path,
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (result.ok) {
      onUploaded();
      onClose();
      return;
    }
    if (result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  const titleId = 'reviewer-upload-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={dialogStyle}
    >
      <h2 id={titleId} style={{ marginTop: 0 }}>
        Upload a reviewer
      </h2>

      <form onSubmit={handleSubmit} aria-busy={busy}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Title</span>
          <input
            type="text"
            value={title}
            required
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Subject</span>
          <select
            value={subjectId}
            required
            onChange={(e) => setSubjectId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— select a subject —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.room ? ` (${s.room})` : ''}
              </option>
            ))}
          </select>
          {!subjectValid && subjects.length === 0 && (
            <p style={hintStyle}>No subjects available yet.</p>
          )}
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>
            Description{' '}
            <span style={{ color: 'var(--muted)' }}>(optional)</span>
          </span>
          <textarea
            value={description}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        <div style={fieldStyle}>
          <span style={labelStyle} id="reviewer-file-label">
            File
          </span>
          <input
            type="file"
            aria-labelledby="reviewer-file-label"
            accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png"
            onChange={(e) => onFilePicked(e.target.files)}
            disabled={busy}
            style={inputStyle}
          />
          {file && !fileError && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.8125rem', color: 'var(--muted)' }}>
              {file.name}
            </p>
          )}
          {fileError && (
            <p role="alert" style={errorHint}>
              {fileError}
            </p>
          )}
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
            PDF, DOCX, PPTX, JPG or PNG · up to 20 MB.
          </p>
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 0.75rem' }}>
            {error}
          </p>
        )}

        <div style={actionsStyle}>
          <button type="submit" disabled={!canSubmit} style={accentButtonStyle}>
            {busy ? (
              <>
                <Spinner /> Uploading…
              </>
            ) : (
              'Upload'
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      style={{ animation: 'spin 0.8s linear infinite', verticalAlign: '-2px' }}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

const dialogStyle: React.CSSProperties = {
  padding: '1.5rem',
  maxWidth: '24rem',
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
};

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.25rem',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  font: 'inherit',
};

const hintStyle: React.CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.75rem',
  color: 'var(--muted)',
};

const errorHint: React.CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.8125rem',
  color: 'var(--danger)',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

const accentButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.5rem 0.75rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
