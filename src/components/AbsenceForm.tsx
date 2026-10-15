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
 *  - an OPTIONAL "evidence link" text input (any URL, e.g. a Google Drive
 *    share link) with light client validation (trim; empty -> omitted;
 *    otherwise must start with http:// or https://, else an inline error).
 *
 * Submit flow: createAbsenceRequest writes the member-owned fields (the form
 * never sends status/officer/review fields; the DB defaults supply
 * status='pending'). The evidence link rides on the request row itself, so a
 * successful insert completes the submit — there is no file upload step.
 *
 * Shows the fixed privacy notice "Your evidence link is visible only to you and
 * class officers." (FR-4.10). Colors come only from tokens.
 */
import { useState, type FormEvent } from 'react';
import type { AbsenceReason, Subject } from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { isValidRange } from '../lib/datewindow';
import { MUTATION_MESSAGES, createAbsenceRequest } from '../data/mutations';
import { CalendarField } from './CalendarField';

const EXPLANATION_MAX = 500;

/** The fixed privacy notice shown under the evidence-link field (FR-4.10). */
export const PRIVACY_NOTICE =
  'Your evidence link is visible only to you and class officers.';

/** Reason option values MUST match the DB absence_reason enum verbatim. */
const REASON_OPTIONS: { value: AbsenceReason; label: string }[] = [
  { value: 'illness', label: 'Illness' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'school_related_activity', label: 'School-related activity' },
  { value: 'other', label: 'Other' },
];

/**
 * Light client-side validation for the optional evidence link. An empty/
 * whitespace-only value is valid (the link is optional). A non-empty value must
 * look like an http(s) URL — this is a UX fast-path, the DB CHECK is the
 * backstop. Module-local (not exported) so this file keeps exporting only the
 * component + the PRIVACY_NOTICE const.
 */
function isValidEvidenceUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return true;
  return /^https?:\/\//i.test(trimmed);
}

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
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rangeValid = isValidRange(dateFrom, dateTo);
  const scopeValid = allClasses || selectedSubjects.length >= 1;
  const explanationValid = explanation.length <= EXPLANATION_MAX;
  const evidenceValid = isValidEvidenceUrl(evidenceUrl);
  const canSubmit =
    rangeValid &&
    scopeValid &&
    explanationValid &&
    evidenceValid &&
    !busy &&
    Boolean(profile?.id);

  function toggleSubject(id: string) {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !profile) return;
    setBusy(true);
    setError(null);

    const trimmed = evidenceUrl.trim();
    const link = trimmed === '' ? undefined : trimmed;

    const created = await createAbsenceRequest({
      userId: profile.id,
      dateFrom,
      dateTo,
      subjectIds: allClasses ? [] : selectedSubjects,
      allClasses,
      reasonCategory: reason,
      explanation,
      evidenceUrl: link,
    });
    if (!created.ok) {
      if (created.error) setError(MUTATION_MESSAGES[created.error]);
      setBusy(false);
      return;
    }

    // Reset the form on success.
    setDateFrom('');
    setDateTo('');
    setSelectedSubjects([]);
    setAllClasses(false);
    setReason('illness');
    setExplanation('');
    setEvidenceUrl('');
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

      <label style={fieldStyle}>
        <span style={labelStyle}>Evidence link (optional)</span>
        <input
          type="url"
          inputMode="url"
          value={evidenceUrl}
          placeholder="https://drive.google.com/..."
          onChange={(e) => setEvidenceUrl(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
        {!evidenceValid && (
          <p role="alert" style={hintError}>
            Enter a link starting with http:// or https://
          </p>
        )}
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
          {PRIVACY_NOTICE}
        </p>
      </label>

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
