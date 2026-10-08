/**
 * App — renders ConfigError when Supabase is not configured, otherwise a
 * minimal placeholder shell. Later FEATs replace the shell with the full
 * SessionProvider -> ThemeProvider -> Layout tree.
 */
import { ConfigError } from './components/ConfigError';
import { isConfigured } from './lib/supabase';

export default function App() {
  if (!isConfigured) {
    return <ConfigError />;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <h1>Class To-Do Board</h1>
      <p className="muted" style={{ color: 'var(--muted)' }}>
        Foundation ready. The schedule, task list, and theme controls arrive in
        the next build steps.
      </p>
    </main>
  );
}
