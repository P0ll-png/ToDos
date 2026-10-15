/**
 * App — renders ConfigError when Supabase is not configured, otherwise mounts
 * the SessionProvider over the content, with ThemeProvider inside it and
 * NavProvider inside ThemeProvider (so nav state lives alongside theme). It
 * renders the single unified TopBar above the PageRouter, which switches
 * between the board, absences, and reviewers pages. Data access is NOT gated
 * on auth — the board is visible to anonymous visitors.
 */
import { ConfigError } from './components/ConfigError';
import { TopBar } from './components/TopBar';
import { PageRouter } from './components/PageRouter';
import { SessionProvider } from './context/SessionProvider';
import { ThemeProvider } from './context/ThemeProvider';
import { NavProvider } from './context/NavProvider';
import { isConfigured } from './lib/supabase';

export default function App() {
  if (!isConfigured) {
    return <ConfigError />;
  }

  return (
    <SessionProvider>
      <ThemeProvider>
        <NavProvider>
          <TopBar />
          <PageRouter />
        </NavProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
