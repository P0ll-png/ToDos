/**
 * App — renders ConfigError when Supabase is not configured, otherwise mounts
 * the SessionProvider and the Header auth/admin entry points over a placeholder
 * shell. Later FEATs replace the shell body with the full
 * ThemeProvider -> Layout (ScheduleGrid + DetailsPanel + TaskList) tree. Data
 * access is NOT gated on auth — the shell is visible to anonymous visitors.
 */
import { ConfigError } from './components/ConfigError';
import { Header } from './components/Header';
import { SessionProvider } from './context/SessionProvider';
import { isConfigured } from './lib/supabase';

export default function App() {
  if (!isConfigured) {
    return <ConfigError />;
  }

  return (
    <SessionProvider>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        <Header />
        <main style={{ padding: '2rem' }}>
          <p className="muted" style={{ color: 'var(--muted)' }}>
            Sign in is optional — the schedule and task list are visible to
            everyone. The schedule, details panel, and theme controls arrive in
            the next build steps.
          </p>
        </main>
      </div>
    </SessionProvider>
  );
}
