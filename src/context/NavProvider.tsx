/**
 * NavProvider — the source of truth for which page is showing. State-based
 * page switching, no router (design OD-1): the app is a single bundle with
 * three flat pages and no deep-link requirement, so a `page` value in a small
 * context is simpler than pinning react-router and matches the existing
 * SessionProvider / ThemeProvider context pattern. If deep-linking is wanted
 * later, history.pushState can be layered onto this same provider without a
 * routing library.
 *
 * Exposes { page, setPage }. App wraps NavProvider inside ThemeProvider and
 * renders a PageRouter that switches on `page`.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Page = 'board' | 'absences' | 'reviewers' | 'announcements';

interface NavContextValue {
  page: Page;
  setPage: (page: Page) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('board');

  const value = useMemo<NavContextValue>(() => ({ page, setPage }), [page]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) {
    throw new Error('useNav must be used within a NavProvider');
  }
  return ctx;
}
