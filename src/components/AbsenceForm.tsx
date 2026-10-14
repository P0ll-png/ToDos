/**
 * AbsenceForm — the member excuse-submission form (FR-4.2/4.3).
 *
 * Fields:
 *  - date_from / date_to via two CalendarField pickers, validated with
 *    isValidRange (the DB CHECK absence_date_range is the backstop);
 *  - a subjects multi-select PLUS an "All classes" checkbox that sets
 *    all_classes and disables the multi-select;
 *  - a reason <select> whose option values match the DB absence_reason enum;
 *  - an explanation <textarea maxLength=500> with a live character counter;
 *  - a file input accepting up to 3 files, each validated by
 *    validateFile(EXCUSE_MIME, EXCUSE_MAX) with inline type/size errors.
 *
 * Upload progress is an INDETERMINATE indicator only (a spinner + "Uploading…"
 * with the submit disabled) — byte-percent progress is out of scope because
 * @supabase/storage-js 2.45.4 upload() is fetch()-based with no progress
 * callback (design OD-5, Error handling → File upload).
 *
 * Submit flow: createAbsenceRequest first (DB defaults supply status='pending';
 * the form never sends status/officer/review fields), then for each file upload
 * to {user_id}/{request_id}/{safeName} and insert its attachment row. On an
 * attachment failure the request is left pending (the member can delete it) and
 * the failing file is named inline.
 *
 * Shows the fixed privacy notice "Attachments are visible only to you and class
 * officers." (FR-4.10). Colors come only from tokens.
 */
import { useState, type FormEvent } from 'react';
import type { AbsenceReason, Subject } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { isValidRange } from '../lib/datewindow';
import {
  EXCUSE_MAX,
  EXCUSE_MIME,
  buildStoragePath,
  validateFile,
} from '../lib/storage';
import {
  MUTATION_MESSAGES,
  addAbsenceAttachment,
  createAbsenceRequest,
} from '../data/mutations';
import { CalendarField } from './CalendarField';

const EXPLANATION_MAX = 500;
const MAX_FILES = 3;

/** The fixed privacy notice shown under the attachments field (FR-4.10). */
export const PRIVACY_NOTICE =
  'Attachments are visible only to you and class officers.';

/** Reason option values MUST match the DB absence_reason enum verbatim. */
const REASON_OPTIONS: { value: AbsenceReason; label: string }[] = [
  { value: 'illness', label: 'Illness' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'school_related_activity', label: 'School-related activity' },
  { value: 'other', label: 'Other' },
];

interface AbsenceFormProps {
  subjects: Subject[];
  /** Called after a successful submit so the parent refetches the list. */
  onSubmitted: () => void;
}

export function AbsenceForm({ subjects, onSubmitted }: AbsenceFormProps) {
  const { profile } = useSession();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [allClasses, setAllClasses] = useState(false);
  const [reason, setReason] = useState<AbsenceReason>('illness');
  const [explanation, setExplanation] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rangeValid = isValidRange(dateFrom, dateTo);
  const scopeValid = allClasses || selectedSubjects.length >= 1;
  const explanationValid = explanation.length <= EXPLANATION_MAX;
  const canSubmit =
    rangeValid &&
    scopeValid &&
    explanationValid &&
    fileError == null &&
    !busy &&
    Boolean(profile?.id);

  function toggleSubject(id: string) {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function onFilesPicked(fileList: FileList | null) {
    setFileError(null);
    if (!fileList) {
      setFiles([]);
      return;
    }
    const picked = Array.from(fileList);
    if (picked.length > MAX_FILES) {
      setFileError(`Up to ${MAX_FILES} files only.`);
      setFiles([]);
      return;
    }
    for (const f of picked) {
      const result = validateFile(
        { type: f.type, size: f.size, name: f.name },
        EXCUSE_MIME,
        EXCUSE_MAX,
      );
      if (!result.ok) {
        setFileError(
          result.reason === 'type'
            ? `"${f.name}": PDF, JPG or PNG only.`
            : `"${f.name}": max 5 MB.`,
        );
        setFiles([]);
        return;
      }
    }
    setFiles(picked);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !profile) return;
    setBusy(true);
    setError(null);

    const created = await createAbsenceRequest({
      userId: profile.id,
      dateFrom,
      dateTo,
      subjectIds: allClasses ? [] : selectedSubjects,
      allClasses,
      reasonCategory: reason,
      explanation,
    });
    if (!created.ok || !created.id) {
      if (created.error) setError(MUTATION_MESSAGES[created.error]);
      setBusy(false);
      return;
    }

    const requestId = created.id;
    for (const file of files) {
      const path = buildStoragePath(profile.id, requestId, file.name);
      const result = await addAbsenceAttachment({
        requestId,
        path,
        file,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!result.ok) {
        // The request row exists and is pending — the member can delete and
        // retry. Surface which file failed and stop.
        setError(
          `Couldn't upload "${file.name}". Your request was saved as pending; ` +
            'you can delete it and try again.',
        );
        setBusy(false);
        onSubmitted();
        return;
      }
    }

    // Reset the form on full success.
    setDateFrom('');
    setDateTo('');
    setSelectedSubjects([]);
    setAllClasses(false);
    setReason('illness');
    setExplanation('');
    setFiles([]);
    setBusy(false);
    onSubmitted();
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle} aria-busy={busy}>
      <h3 style={{ margin: '0 0 0.75rem' }}>File an absence request</h3>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Date from</span>
          <CalendarField
            label="Date from"
            value={dateFrom}
            onChange={setDateFrom}
          />
        </div>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Date to</span>
          <CalendarField label="Date to" value={dateTo} onChange={setDateTo} />
        </div>
      </div>
      {dateFrom !== '' && dateTo !== '' && !rangeValid && (
        <p role="alert" style={hintError}>
          The end date must be on or after the start date.
        </p>
      )}

      <fieldset style={fieldsetStyle}>
        <legend style={labelStyle}>Subjects affected</legend>
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={allClasses}
            onChange={(e) => setAllClasses(e.target.checked)}
          />
          All classes
        </label>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginTop: '0.5rem',
            opacity: allClasses ? 0.5 : 1,
          }}
        >
          {subjects.length === 0 ? (
            <span style={{ color: 'var(--muted)' }}>No subjects available.</span>
          ) : (
            subjects.map((s) => (
              <label key={s.id} style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  disabled={allClasses}
                  checked={selectedSubjects.includes(s.id)}
                  onChange={() => toggleSubject(s.id)}
                />
                {s.name}
              </label>
            ))
          )}
        </div>
        {!scopeValid && (
          <p role="alert" style={hintError}>
            Select at least one subject or choose All classes.
          </p>
        )}
      </fieldset>

      <label style={fieldStyle}>
        <span style={labelStyle}>Reason</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as AbsenceReason)}
          style={inputStyle}
        >
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>
          Explanation{' '}
          <span style={{ color: 'var(--muted)' }}>
            ({explanation.length}/{EXPLANATION_MAX})
          </span>
        </span>
        <textarea
          value={explanation}
          maxLength={EXPLANATION_MAX}
          rows={3}
          onChange={(e) => setExplanation(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>

      <div style={fieldStyle}>
        <span style={labelStyle}>Attachments (optional, up to 3)</span>
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => onFilesPicked(e.target.files)}
          disabled={busy}
          style={inputStyle}
        />
        {files.length > 0 && !fileError && (
          <ul style={fileListStyle}>
            {files.map((f) => (
              <li key={f.name} style={{ color: 'var(--muted)' }}>
                {f.name}
                {busy && (
                  <span style={{ marginLeft: '0.5rem' }}>
                    <Spinner /> Uploading…
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {fileError && (
          <p role="alert" style={hintError}>
            {fileError}
          </p>
        )}
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
          {PRIVACY_NOTICE}
        </p>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 0.75rem' }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={!canSubmit} style={accentButtonStyle}>
        {busy ? (
          <>
            <Spinner /> Submitting…
          </>
        ) : (
          'Submit request'
        )}
      </button>
    </form>
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

const formStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem',
  color: 'var(--text)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  marginBottom: '0.75rem',
  flexWrap: 'wrap',
};

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.75rem',
};

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  padding: '0.75rem',
  marginBottom: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.25rem',
  fontWeight: 500,
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
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

const fileListStyle: React.CSSProperties = {
  margin: '0.5rem 0 0',
  paddingLeft: '1.1rem',
  fontSize: '0.8125rem',
};

const hintError: React.CSSProperties = {
  color: 'var(--danger)',
  margin: '0.25rem 0 0',
  fontSize: '0.8125rem',
};

const accentButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.5rem 0.9rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
