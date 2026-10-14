/**
 * ReviewersPage — PLACEHOLDER (FEAT-003 shell). Gated via useSession: when
 * signed out it renders SignInGate instead of fetching or rendering data
 * (design OD-1); when signed in it shows a "coming soon" stub.
 *
 * FEAT-006 replaces this stub with the real reviewers UX (card grid of shared
 * study files). The gating pattern and the signed-in branch stay; only the stub
 * body is swapped out.
 */
import { useSession } from '../context/SessionProvider';
import { SignInGate } from './SignInGate';

export function ReviewersPage() {
  const { session } = useSession();

  if (!session) {
    return <SignInGate message="Sign in to view and share reviewers." />;
  }

  return (
    <section style={stubStyle}>
      <h2 style={{ margin: 0 }}>Reviewers</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Coming soon.</p>
    </section>
  );
}

const stubStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '2rem 1rem',
  color: 'var(--text)',
};
