/**
 * TopBar — the single, unified responsive top bar rendered once at App level.
 * It folds together what used to be two stacked bars (Header + Nav) so every
 * page shows exactly ONE bar (design OD-1, fixes the duplicate-navbar bug).
 *
 * Three direct flex children, reordered per breakpoint via CSS `order`:
 *   .topbar-brand — the circular logo holder (.header-logo + the HeaderLogo
 *     /logo.png-with-SVG fallback) and the app title (.header-title).
 *   .topbar-tabs — the real <button> tabs (Board / Absences / Reviewers /
 *     Announcements) wired to setPage with aria-current="page" on the active
 *     one, carrying the officer-only Absences pending-count badge (design OD-4).
 *   <AccountControls /> — theme + (officer) members + auth.
 *
 * DESKTOP: brand, then tabs right beside it, with AccountControls pushed to the
 * far edge, so every page option sits next to the "Class To-Do Board" sign.
 * MOBILE (<=640px): the brand and AccountControls share the top line (logo +
 * theme + sign in/out together) and the tabs wrap onto their own full-width
 * line below — no horizontal page scroll.
 *
 * Colors come only from CSS tokens; the global :focus-visible ring applies to
 * every button. Responsive layout lives in base.css (.topbar* rules).
 */
import { useState, type ReactNode } from 'react';
import { useNav, type Page } from '../context/NavProvider';
import { useSession } from '../context/SessionProvider';
import { useAbsencePendingCount } from '../data/useAbsencePendingCount';
import { AccountControls } from './AccountControls';

interface NavItem {
  page: Page;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { page: 'board', label: 'Board' },
  { page: 'absences', label: 'Absences' },
  { page: 'reviewers', label: 'Reviewers' },
  { page: 'announcements', label: 'Announcements' },
];

export function TopBar() {
  const { page, setPage } = useNav();
  const { isOfficer } = useSession();
  // Officer pending-count badge (design OD-4): the count query is enabled only
  // for officers; the badge is hidden entirely for non-officers or when zero.
  const { count } = useAbsencePendingCount(isOfficer);

  // The live badge element shown after the Absences label.
  const badgeFor = (itemPage: Page): ReactNode => {
    if (itemPage !== 'absences' || !isOfficer || count <= 0) return null;
    return (
      <span
        aria-label={`${count} pending`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '1.25rem',
          height: '1.25rem',
          padding: '0 0.35rem',
          background: 'var(--status-pending)',
          color: 'var(--status-pending-fg)',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {count}
      </span>
    );
  };

  return (
    <nav
      className="topbar"
      aria-label="Primary"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
      }}
    >
      {/*
        Three direct children of .topbar so flex `order` can rearrange them per
        breakpoint (see base.css):
          1. .topbar-brand  — logo + title
          2. .topbar-tabs   — the page tabs
          3. AccountControls — theme + (officer) members + auth
        DESKTOP: brand, then tabs right beside it, with AccountControls pushed to
        the far right (margin-left:auto on AccountControls) — every page option
        lines up next to the "Class To-Do Board" sign.
        MOBILE (<=640px): brand (order 0) and AccountControls (order 1) share the
        top line — so the logo, theme button and sign in/out button sit together
        — and the tabs (order 2) wrap onto their own full-width line below.
      */}
      <div className="topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <span className="header-logo" aria-hidden="true">
          <HeaderLogo />
        </span>
        <h1 className="header-title" style={{ fontSize: '1.125rem', margin: 0 }}>
          II-CCSAD || Class To-Do Board
        </h1>
      </div>

      <div className="topbar-tabs" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.page === page;
          return (
            <button
              key={item.page}
              type="button"
              onClick={() => setPage(item.page)}
              aria-current={active ? 'page' : undefined}
              style={active ? activeTabStyle : tabStyle}
            >
              {item.label}
              {badgeFor(item.page)}
            </button>
          );
        })}
      </div>

      <AccountControls />
    </nav>
  );
}

/**
 * HeaderLogo — the mark inside the circular holder. Loads /logo.png from the
 * public/ folder; if that file is absent or fails to load, it falls back to a
 * built-in SVG mark so the bar never shows a broken image. Drop your logo at
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

const tabStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.375rem 0.75rem',
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid transparent',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
};
