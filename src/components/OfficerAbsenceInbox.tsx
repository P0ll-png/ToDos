/**
 * OfficerAbsenceInbox — all absence requests ordered newest-first, with
 * CLIENT-SIDE filters over the already-authorized rows (ar_select returns every
 * row to an officer). Scale assumption (NIT7): class-scale volume, so all rows
 * are fetched and filtered in memory; no pagination.
 *
 * Filters:
 *  - status <select>;
 *  - date-range (via rangeOverlaps against each request's date_from/date_to);
 *  - subject <select> — a request matches subject S iff all_classes is true OR
 *    subject_ids contains S (an "All classes" request matches EVERY subject);
 *  - student-name text, case-insensitive over the embedded studentName.
 *
 * Attachments open via a freshly minted signed URL on click
 * (signedUrlFor('excuse-attachments', path)): the default inline disposition
 * opens in a new tab for preview; an optional "Save a copy" re-mints with
 * { download: file_name }. A per-row busy/error state covers mint latency and a
 * denial (a wrong path yields an inline access error, not a file).
 *
 * The status <select> + remark <textarea> are saved via updateAbsenceStatus;
 * after a save the parent's pending-count refetch is triggered.
 */
import { useEffect, useMemo, useState } from 'react';
import type {
  AbsenceAttachment,
  AbsenceAttachmentRow,
  AbsenceReason,
  AbsenceRequest,
  AbsenceStatus,
  Subject,
} from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { rangeOverlaps } from '../lib/datewindow';
import { supabase } from '../lib/supabase';
import {
  MUTATION_MESSAGES,
  SIGNED_URL_MESSAGES,
  signedUrlFor,
  updateAbsenceStatus,
} from '../data/mutations';
import { StatusBadge } from './StatusBadge';

const REASON_LABELS: Record<AbsenceReason, string> = {
  illness: 'Illness',
  family_emergency: 'Family emergency',
  school_related_activity: 'School-related activity',
  other: 'Other',
};

const STATUS_OPTIONS: { value: AbsenceStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'needs_followup', label: 'Needs follow-up' },
];

interface OfficerAbsenceInboxProps {
  requests: AbsenceRequest[];
  subjects: Subject[];
  /** Refetch the full list after a status change. */
  onChanged: () => void;
  /** Refetch the nav pending count after a status change. */
  onStatusSaved: () => void;
}

export function OfficerAbsenceInbox({
  requests,
  subjects,
  onChanged,
  onStatusSaved,
}: OfficerAbsenceInboxProps) {
  const [statusFilter, setStatusFilter] = useState<AbsenceStatus | 'all'>('all');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [nameFilter, setNameFilter] = useState('');

  const filtered = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    const hasRange = fromFilter !== '' && toFilter !== '';
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (hasRange) {
        if (
          !rangeOverlaps(
            { from: r.dateFrom, to: r.dateTo },
            { from: fromFilter, to: toFilter },
          )
        ) {
          return false;
        }
      }
      if (subjectFilter !== 'all') {
        // An "All classes" request matches EVERY subject filter.
        const matches = r.allClasses || r.subjectIds.includes(subjectFilter);
        if (!matches) return false;
      }
      if (name && !(r.studentName ?? '').toLowerCase().includes(name)) {
        return false;
      }
      return true;
    });
  }, [requests, statusFilter, fromFilter, toFilter, subjectFilter, nameFilter]);

  return (
    <div>
      <div style={filterBarStyle}>
        <label style={filterLabelStyle}>
          Status
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as AbsenceStatus | 'all')
            }
            style={smallInputStyle}
          >
            <option value="all">All</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabelStyle}>
          From
          <input
            type="date"
            value={fromFilter}
            onChange={(e) => setFromFilter(e.target.value)}
            style={smallInputStyle}
          />
        </label>
        <label style={filterLabelStyle}>
          To
          <input
            type="date"
            value={toFilter}
            onChange={(e) => setToFilter(e.target.value)}
            style={smallInputStyle}
          />
        </label>
        <label style={filterLabelStyle}>
          Subject
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            style={smallInputStyle}
          >
            <option value="all">All</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabelStyle}>
          Student
          <input
            type="text"
            value={nameFilter}
            placeholder="Search name"
            onChange={(e) => setNameFilter(e.target.value)}
            style={smallInputStyle}
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No requests match these filters.</p>
      ) : (
        <ul style={listStyle}>
          {filtered.map((r) => (
            <InboxRow
              key={r.id}
              request={r}
              subjects={subjects}
              onChanged={onChanged}
              onStatusSaved={onStatusSaved}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface InboxRowProps {
  request: AbsenceRequest;
  subjects: Subject[];
  onChanged: () => void;
  onStatusSaved: () => void;
}

function InboxRow({
  request,
  subjects,
  onChanged,
  onStatusSaved,
}: InboxRowProps) {
  const { profile } = useSession();
  const [status, setStatus] = useState<AbsenceStatus>(request.status);
  const [remark, setRemark] = useState(request.officerRemark ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attachments for this request are loaded on demand (one query per row).
  const [attachments, setAttachments] = useState<AbsenceAttachment[] | null>(
    null,
  );
  const [attachError, setAttachError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        setAttachments([]);
        return;
      }
      const { data, error: err } = await supabase
        .from('absence_attachments')
        .select('*')
        .eq('request_id', request.id);
      if (!active) return;
      if (err) {
        setAttachError('Could not load attachments.');
        setAttachments([]);
        return;
      }
      setAttachments(
        (data as AbsenceAttachmentRow[]).map((a) => ({
          id: a.id,
          requestId: a.request_id,
          storagePath: a.storage_path,
          fileName: a.file_name,
          mimeType: a.mime_type,
          sizeBytes: a.size_bytes,
        })),
      );
    }
    void load();
    return () => {
      active = false;
    };
  }, [request.id]);

  async function openAttachment(
    att: AbsenceAttachment,
    download: boolean,
  ) {
    setFileBusy(att.id);
    setFileError(null);
    const result = await signedUrlFor('excuse-attachments', att.storagePath, {
      download: download ? att.fileName : false,
    });
    setFileBusy(null);
    if (!result.ok) {
      setFileError(SIGNED_URL_MESSAGES[result.error]);
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await updateAbsenceStatus(request.id, {
      status,
      officerRemark: remark.trim() === '' ? null : remark.trim(),
      reviewedBy: profile?.id ?? null,
    });
    if (result.ok) {
      onChanged();
      onStatusSaved();
      setBusy(false);
      return;
    }
    if (result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? 'Unknown subject';
  const scope = request.allClasses
    ? 'All classes'
    : request.subjectIds.map(subjectName).join(', ') || '—';

  return (
    <li style={rowStyle}>
      <div style={rowHeadStyle}>
        <div>
          <strong>{request.studentName || 'Unknown student'}</strong>
          <div style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>
            {request.dateFrom}
            {request.dateTo !== request.dateFrom ? ` → ${request.dateTo}` : ''}{' '}
            · {REASON_LABELS[request.reasonCategory]} · {scope}
          </div>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {request.explanation && (
        <p style={{ margin: '0.4rem 0 0' }}>{request.explanation}</p>
      )}

      <div style={{ marginTop: '0.5rem' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
          Attachments:{' '}
        </span>
        {attachments == null ? (
          <span style={{ color: 'var(--muted)' }}>Loading…</span>
        ) : attachments.length === 0 ? (
          <span style={{ color: 'var(--muted)' }}>None</span>
        ) : (
          <ul style={attachListStyle}>
            {attachments.map((a) => (
              <li key={a.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => openAttachment(a, false)}
                  disabled={fileBusy === a.id}
                  style={linkButtonStyle}
                >
                  {a.fileName}
                </button>
                <button
                  type="button"
                  onClick={() => openAttachment(a, true)}
                  disabled={fileBusy === a.id}
                  style={subtleButtonStyle}
                >
                  Save a copy
                </button>
                {fileBusy === a.id && (
                  <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                    Opening…
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {attachError && (
          <span role="alert" style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>
            {attachError}
          </span>
        )}
        {fileError && (
          <p role="alert" style={{ margin: '0.25rem 0 0', color: 'var(--danger)', fontSize: '0.75rem' }}>
            {fileError}
          </p>
        )}
      </div>

      <div style={reviewRowStyle}>
        <label style={filterLabelStyle}>
          Set status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AbsenceStatus)}
            style={smallInputStyle}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...filterLabelStyle, flex: 1, minWidth: '12rem' }}>
          Remark
          <textarea
            value={remark}
            rows={2}
            onChange={(e) => setRemark(e.target.value)}
            style={{ ...smallInputStyle, resize: 'vertical' }}
          />
        </label>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          style={accentButtonStyle}
        >
          {busy ? 'Saving…' : 'Save review'}
        </button>
        {error && (
          <span role="alert" style={{ marginLeft: '0.5rem', color: 'var(--danger)' }}>
            {error}
          </span>
        )}
      </div>
    </li>
  );
}

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  marginBottom: '1rem',
};

const filterLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.8125rem',
  color: 'var(--muted)',
};

const smallInputStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  font: 'inherit',
  fontSize: '0.875rem',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const rowStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '0.9rem 1rem',
  color: 'var(--text)',
};

const rowHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '0.5rem',
};

const attachListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: '0.25rem 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const reviewRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap',
  marginTop: '0.75rem',
};

const linkButtonStyle: React.CSSProperties = {
  padding: 0,
  background: 'transparent',
  color: 'var(--accent-text)',
  border: 'none',
  textDecoration: 'underline',
  font: 'inherit',
  fontSize: '0.875rem',
};

const subtleButtonStyle: React.CSSProperties = {
  padding: '0.15rem 0.5rem',
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  font: 'inherit',
  fontSize: '0.75rem',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
