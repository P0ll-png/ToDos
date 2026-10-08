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
import { AppearancePanel } from './AppearancePanel';

export function Header() {
  const { session, profile, isOfficer } = useSession();
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);

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
        <button
          type="button"
          onClick={() => setShowAppearance(true)}
          aria-label="Appearance settings"
          title="Appearance"
          style={iconButtonStyle}
        >
          <PaletteIcon />
        </button>

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
      {showAppearance && (
        <Overlay onClose={() => setShowAppearance(false)}>
          <AppearancePanel onClose={() => setShowAppearance(false)} />
        </Overlay>
      )}
    </header>
  );
}

/** Palette/gear icon for the Appearance entry. Decorative (aria-hidden). */
function PaletteIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" />
    </svg>
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

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2rem',
  height: '2rem',
  padding: 0,
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
};
