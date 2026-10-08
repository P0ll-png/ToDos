/**
 * Header — a circular logo holder, the app title, and the auth/admin entry
 * points. The Members (admin) button renders only for officers; that is UI
 * convenience, not a security boundary (AdminPanel/setRole trust RLS). Sign in
 * is optional — anonymous visitors get the full read-only app. All entry points
 * are real <button>s with the global focus ring.
 *
 * Responsive (<=640px): the title text and the signed-in account name collapse
 * away, and the sign in/out control becomes an icon-only button. The logo and
 * the Appearance/Members icons remain. See .header-* rules in base.css.
 */
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../context/SessionProvider';
import { AuthDialog } from './AuthDialog';
import { AdminPanel } from './AdminPanel';
import { AppearancePanel } from './AppearancePanel';
import { Modal } from './Modal';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <span className="header-logo" aria-hidden="true">
          <HeaderLogo />
        </span>
        <h1 className="header-title" style={{ fontSize: '1.125rem', margin: 0 }}>
          II-CCSAD || Class To-Do Board
        </h1>
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
            <span
              className="header-account-name muted"
              style={{ color: 'var(--muted)' }}
            >
              {displayName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="header-auth-btn"
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
            className="header-auth-btn"
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
      </nav>

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
    </header>
  );
}

/**
 * HeaderLogo — the mark inside the circular holder. Loads /logo.png from the
 * public/ folder; if that file is absent or fails to load, it falls back to a
 * built-in SVG mark so the header never shows a broken image. Drop your logo at
 * public/logo.png to use it — no code change needed (see public/README.md).
 */
function HeaderLogo() {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) return <LogoMark />;
  return (
    <img
      src="/logo.png"
      alt=""
      onError={() => setImgFailed(true)}
    />
  );
}

/** Built-in fallback mark used when no /logo.png is present. Decorative. */
function LogoMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
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
