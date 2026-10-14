/**
 * Nav — the themed top bar: three real <button>s (Board / Absences /
 * Reviewers) wired to setPage, with aria-current="page" on the active one
 * (design OD-1, FR-0.5), plus the shared <AccountControls />. State-based page
 * switching, no router.
 *
 * The Absences button carries a slot for the officer pending-count badge; it is
 * left as an empty placeholder here and wired by FEAT-005 (replace the
 * `pendingBadge` placeholder with the live count). Colors come only from CSS
 * tokens; the global :focus-visible ring applies to every button.
 */
import type { ReactNode } from 'react';
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
];

export function Nav() {
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
      aria-label="Primary"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
