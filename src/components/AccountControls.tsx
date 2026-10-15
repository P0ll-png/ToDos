/**
 * AccountControls — the right-side cluster shared by the Header and the Nav
 * bar: the Appearance button + AppearancePanel modal, the officer-only Members
 * button + AdminPanel modal, the account-name span, and the sign-in/sign-out
 * button + AuthDialog modal. Extracted from Header (design OD-1) so both Header
 * and Nav compose the same controls instead of duplicating them.
 *
 * The Members (admin) button renders only for officers; that is UI convenience,
 * not a security boundary (AdminPanel/setRole trust RLS). Sign in is optional —
 * anonymous visitors get the full read-only app. All entry points are real
 * <button>s with the global focus ring.
 *
 * Responsive (<=640px): the signed-in account name collapses away and the sign
 * in/out control becomes an icon-only button. See .header-* rules in base.css.
 */
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../context/SessionProvider';
import { AuthDialog } from './AuthDialog';
import { AdminPanel } from './AdminPanel';
import { AppearancePanel } from './AppearancePanel';
import { Modal } from './Modal';

export function AccountControls() {
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
    <div className="account-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={() => setShowAppearance(true)}
        aria-label="Appearance settings"
        title="Appearance"
        className="account-btn"
        style={iconButtonStyle}
      >
        <PaletteIcon />
      </button>

      {isOfficer && (
        <button
          type="button"
          onClick={() => setShowAdmin(true)}
          className="account-btn"
          style={secondaryButtonStyle}
        >
          Members
        </button>
      )}

      {session ? (
        <>
          <span
            className="header-account-name muted"
            style={{ color: 'var(--muted)' }}
          >
            {displayName}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="header-auth-btn account-btn"
            aria-label="Sign out"
            title="Sign out"
            style={secondaryButtonStyle}
          >
            <span className="header-auth-label">Sign out</span>
            <span className="header-auth-icon">
              <SignOutIcon />
            </span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowAuth(true)}
          className="header-auth-btn account-btn"
          aria-label="Sign in"
          title="Sign in"
          style={accentButtonStyle}
        >
          <span className="header-auth-label">Sign in</span>
          <span className="header-auth-icon">
            <SignInIcon />
          </span>
        </button>
      )}

      {showAuth && (
        <Modal onClose={() => setShowAuth(false)}>
          <AuthDialog onClose={() => setShowAuth(false)} />
        </Modal>
      )}
      {showAdmin && (
        <Modal onClose={() => setShowAdmin(false)}>
          <AdminPanel onClose={() => setShowAdmin(false)} />
        </Modal>
      )}
      {showAppearance && (
        <Modal onClose={() => setShowAppearance(false)}>
          <AppearancePanel onClose={() => setShowAppearance(false)} />
        </Modal>
      )}
    </div>
  );
}

/** Sign-in (log-in) icon, shown on small screens in place of the label. */
function SignInIcon() {
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
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

/** Sign-out (log-out) icon, shown on small screens in place of the label. */
function SignOutIcon() {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
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
