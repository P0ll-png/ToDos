/**
 * MyAbsenceList — the member "My requests" list (FR-4.7/4.11). Each row shows
 * the date range, affected subjects (or "All classes"), the reason, the
 * explanation, a StatusBadge, and the officer remark once set. A Delete button
 * is shown ONLY while the request is pending; RLS (ar_delete_member) is the real
 * gate, the UI hiding is convenience only.
 *
 * Colors come only from tokens.
 */
import { useState } from 'react';
import type { AbsenceReason, AbsenceRequest, Subject } from '../lib/types';
import { MUTATION_MESSAGES, deleteAbsenceRequest } from '../data/mutations';
import { StatusBadge } from './StatusBadge';

const REASON_LABELS: Record<AbsenceReason, string> = {
  illness: 'Illness',
  family_emergency: 'Family emergency',
  school_related_activity: 'School-related activity',
  other: 'Other',
};

interface MyAbsenceListProps {
  requests: AbsenceRequest[];
  subjects: Subject[];
  /** Refetch the list after a delete. */
  onChanged: () => void;
}

export function MyAbsenceList({
  requests,
  subjects,
  onChanged,
}: MyAbsenceListProps) {
  if (requests.length === 0) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        You haven't filed any absence requests yet.
      </p>
    );
  }
  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? 'Unknown subject';

  return (
    <ul style={listStyle}>
      {requests.map((r) => (
        <AbsenceRow
          key={r.id}
          request={r}
          subjectName={subjectName}
          onChanged={onChanged}
        />
      ))}
    </ul>
  );
}

interface AbsenceRowProps {
  request: AbsenceRequest;
  subjectName: (id: string) => string;
  onChanged: () => void;
}

function AbsenceRow({ request, subjectName, onChanged }: AbsenceRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteAbsenceRequest(request.id);
    if (result.ok) {
      onChanged();
      return;
    }
    if (result.error) setError(MUTATION_MESSAGES[result.error]);
    setBusy(false);
  }

  const scope = request.allClasses
    ? 'All classes'
    : request.subjectIds.map(subjectName).join(', ') || '—';

  return (
    <li style={rowStyle}>
      <div style={rowHeadStyle}>
        <strong>
          {request.dateFrom}
          {request.dateTo !== request.dateFrom ? ` → ${request.dateTo}` : ''}
        </strong>
        <StatusBadge status={request.status} />
      </div>
      <div style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>
        {REASON_LABELS[request.reasonCategory]} · {scope}
      </div>
      {request.explanation && (
        <p style={{ margin: '0.4rem 0 0' }}>{request.explanation}</p>
      )}
      {request.officerRemark && (
        <p
          style={{
            margin: '0.4rem 0 0',
            padding: '0.4rem 0.6rem',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'calc(var(--radius) - 6px)',
            fontSize: '0.8125rem',
          }}
        >
          <span style={{ color: 'var(--muted)' }}>Officer remark: </span>
          {request.officerRemark}
        </p>
      )}
      {request.status === 'pending' && (
        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            style={dangerButtonStyle}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
          {error && (
            <span role="alert" style={{ marginLeft: '0.5rem', color: 'var(--danger)' }}>
              {error}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

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
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '0.35rem 0.7rem',
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
