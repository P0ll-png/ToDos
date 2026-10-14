/**
 * ReviewersPage — the real gated Reviewers page (FEAT-006, FR-5.*).
 *
 * Gating (design OD-1): signed-out visitors see SignInGate (the DB also denies
 * anon any read on reviewers — no grant/policy — so the gate is UX, not the
 * real boundary). Any signed-in user may both upload and download reviewers.
 *
 * The page owns the loading / error states (reusing the status/retry contract);
 * the empty state lives inside ReviewerGrid so its copy can distinguish
 * "nothing uploaded yet" from "nothing matches your filters". The upload entry
 * opens ReviewerUploadDialog inside the shared Modal.
 */
import { useState } from 'react';
import { useSession } from '../context/SessionProvider';
import { useSubjects } from '../data/useSubjects';
import { useReviewers } from '../data/useReviewers';
import { SignInGate } from './SignInGate';
import { Modal } from './Modal';
import { ReviewerUploadDialog } from './ReviewerUploadDialog';
import { ReviewerGrid } from './ReviewerGrid';

export function ReviewersPage() {
  const { session } = useSession();

  if (!session) {
    return <SignInGate message="Sign in to view and share reviewers." />;
  }

  return <ReviewersView />;
}

function ReviewersView() {
  const { data: subjects } = useSubjects();
  const { data: reviewers, status, retry } = useReviewers();
  const [showUpload, setShowUpload] = useState(false);

  return (
    <section style={pageStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0 }}>Reviewers</h2>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          style={accentButtonStyle}
        >
          Upload a reviewer
        </button>
      </div>

      {status === 'loading' && <p style={mutedStyle}>Loading reviewers…</p>}
      {status === 'error' && <ErrorState onRetry={retry} />}
      {status === 'ready' && (
        <ReviewerGrid
          reviewers={reviewers}
          subjects={subjects}
          onChanged={retry}
        />
      )}

      {showUpload && (
        <Modal onClose={() => setShowUpload(false)}>
          <ReviewerUploadDialog
            subjects={subjects}
            onClose={() => setShowUpload(false)}
            onUploaded={retry}
          />
        </Modal>
      )}
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ color: 'var(--text)' }}>
      <p style={mutedStyle}>Couldn't load reviewers.</p>
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

const accentButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
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
