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
 * Each request may carry an optional evidence link (request.evidenceUrl). It is
 * rendered as a safe external anchor (target="_blank" rel="noopener noreferrer")
 * when present; the officer sees it under the same owner-or-officer rule the
 * request already uses (ar_select). Nothing is rendered when it is null.
 *
 * The status <select> + remark <textarea> are saved via updateAbsenceStatus;
 * after a save the parent's pending-count refetch is triggered.
 */
import { useMemo, useState } from 'react';
import type {
  AbsenceReason,
  AbsenceRequest,
  AbsenceStatus,
  Subject,
} from '../lib/types';
import { useSession } from '../context/SessionProvider';
import { rangeOverlaps } from '../lib/datewindow';
import { MUTATION_MESSAGES, updateAbsenceStatus } from '../data/mutations';
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

      {request.evidenceUrl && (
        <div style={{ marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
            Evidence:{' '}
          </span>
          <a
            href={request.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={evidenceLinkStyle}
          >
            {request.evidenceUrl}
          </a>
        </div>
      )}

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

const reviewRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap',
  marginTop: '0.75rem',
};

const evidenceLinkStyle: React.CSSProperties = {
  color: 'var(--accent-text)',
  textDecoration: 'underline',
  fontSize: '0.875rem',
  wordBreak: 'break-all',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
