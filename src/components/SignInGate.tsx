/**
 * SignInGate — a short prompt + a "Sign in" button that opens the shared
 * AuthDialog via Modal. Rendered by gated pages (Absences / Reviewers) when
 * useSession() reports no session (design OD-1). This is a UI convenience over
 * the real RLS boundary: the DB denies anon reads on those tables regardless,
 * so a signed-out visitor can never retrieve rows even if the gate were
 * bypassed.
 *
 * It reads live session state, so if the user signs in from the dialog the
 * surrounding page re-renders out of the gate automatically; likewise it
 * re-appears if the user signs out while on a gated page.
 *
 * Tokens only; the "Sign in" button is a real <button> with the global focus
 * ring.
 */
import { useState } from 'react';
import { AuthDialog } from './AuthDialog';
import { Modal } from './Modal';

export function SignInGate({ message }: { message?: string }) {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '3rem 1rem',
        textAlign: 'center',
        color: 'var(--text)',
      }}
    >
      <p style={{ margin: 0, color: 'var(--muted)', maxWidth: '28rem' }}>
        {message ?? 'Sign in to view this page.'}
      </p>
      <button
        type="button"
        onClick={() => setShowAuth(true)}
        style={accentButtonStyle}
      >
        Sign in
      </button>

      {showAuth && (
        <Modal onClose={() => setShowAuth(false)}>
          <AuthDialog onClose={() => setShowAuth(false)} />
        </Modal>
      )}
    </div>
  );
}

const accentButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
