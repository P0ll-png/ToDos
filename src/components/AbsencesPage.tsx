/**
 * AbsencesPage — the real gated Absences page (FEAT-005, FR-4.*).
 *
 * Gating (design OD-1): signed-out visitors see SignInGate (the DB also denies
 * anon any read on the absence tables, so the gate is UX, not the real
 * boundary). Signed-in users branch on isOfficer:
 *   - members get the AbsenceForm + their own "My requests" list (member-mode
 *     read; RLS returns only their rows);
 *   - officers get the OfficerAbsenceInbox (officer-mode read with the
 *     privacy-safe name-only student embed).
 *
 * The page owns the loading / empty / error states using the existing
 * status/retry pattern; the empty state is handled inside the child lists.
 */
import { useSession } from '../context/SessionProvider';
import { useSubjects } from '../data/useSubjects';
import { useAbsenceRequests } from '../data/useAbsenceRequests';
import { notifyAbsenceStatusChanged } from '../data/useAbsencePendingCount';
import { SignInGate } from './SignInGate';
import { AbsenceForm } from './AbsenceForm';
import { MyAbsenceList } from './MyAbsenceList';
import { OfficerAbsenceInbox } from './OfficerAbsenceInbox';

export function AbsencesPage() {
  const { session, isOfficer } = useSession();

  if (!session) {
    return <SignInGate message="Sign in to file and view absence requests." />;
  }

  return isOfficer ? <OfficerView /> : <MemberView />;
}

function MemberView() {
  const { data: subjects } = useSubjects();
  const { data, status, retry, refetch } = useAbsenceRequests('member');

  return (
    <section style={pageStyle}>
      <h2 style={{ marginTop: 0 }}>Absences</h2>
      <AbsenceForm subjects={subjects} onSubmitted={refetch} />

      <h3 style={{ margin: '1.5rem 0 0.75rem' }}>My requests</h3>
      {status === 'loading' && <p style={mutedStyle}>Loading your requests…</p>}
      {status === 'error' && (
        <ErrorState onRetry={retry} />
      )}
      {status === 'ready' && (
        <MyAbsenceList requests={data} subjects={subjects} onChanged={refetch} />
      )}
    </section>
  );
}

function OfficerView() {
  const { data: subjects } = useSubjects();
  const { data, status, retry, refetch } = useAbsenceRequests('officer');

  return (
    <section style={pageStyle}>
      <h2 style={{ marginTop: 0 }}>Absence inbox</h2>
      {status === 'loading' && <p style={mutedStyle}>Loading requests…</p>}
      {status === 'error' && <ErrorState onRetry={retry} />}
      {status === 'ready' && (
        <OfficerAbsenceInbox
          requests={data}
          subjects={subjects}
          onChanged={refetch}
          onStatusSaved={notifyAbsenceStatusChanged}
        />
      )}
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ color: 'var(--text)' }}>
      <p style={mutedStyle}>Couldn't load absence requests.</p>
      <button type="button" onClick={onRetry} style={retryButtonStyle}>
        Retry
      </button>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: '48rem',
  margin: '0 auto',
  padding: '1.5rem 1rem',
  color: 'var(--text)',
};

const mutedStyle: React.CSSProperties = {
  color: 'var(--muted)',
};

const retryButtonStyle: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
