/**
 * Header — a circular logo holder, the app title, and the shared account
 * controls (Appearance, officer-only Members, account name, sign-in/out),
 * composed from <AccountControls />. The right-side cluster was extracted into
 * AccountControls (design OD-1) so the Nav bar can reuse the exact same
 * controls without duplicating them.
 *
 * Responsive (<=640px): the title text collapses away (the logo stands in for
 * it); AccountControls handles its own responsive collapse. See .header-*
 * rules in base.css.
 */
import { useState } from 'react';
import { AccountControls } from './AccountControls';

export function Header() {
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

      <AccountControls />
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
