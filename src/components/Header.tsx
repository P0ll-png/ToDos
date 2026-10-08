/**
 * Header — app title, the "Officers can edit" tag, and the auth/admin entry
 * points. The Members (admin) button renders only for officers; that is UI
 * convenience, not a security boundary (AdminPanel/setRole trust RLS). Sign in
 * is optional — anonymous visitors get the full read-only app. All entry points
 * are real <button>s with the global focus ring.
 */
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../context/SessionProvider';
import { AuthDialog } from './AuthDialog';
import { AdminPanel } from './AdminPanel';

export function Header() {
  const { session, profile, isOfficer } = useSession();
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  const displayName = profile?.name || profile?.email || 'Account';

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.125rem', margin: 0 }}>Class To-Do Board</h1>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.5rem',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          Officers can edit
        </span>
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {isOfficer && (
          <button
            type="button"
            onClick={() => setShowAdmin(true)}
            style={secondaryButtonStyle}
          >
            Members
          </button>
        )}

        {session ? (
          <>
            <span className="muted" style={{ color: 'var(--muted)' }}>
              {displayName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              style={secondaryButtonStyle}
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            style={accentButtonStyle}
          >
            Sign in
          </button>
        )}
      </nav>

      {showAuth && (
        <Overlay onClose={() => setShowAuth(false)}>
          <AuthDialog onClose={() => setShowAuth(false)} />
        </Overlay>
      )}
      {showAdmin && (
        <Overlay onClose={() => setShowAdmin(false)}>
          <AdminPanel onClose={() => setShowAdmin(false)} />
        </Overlay>
      )}
    </header>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 50,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

const accentButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
