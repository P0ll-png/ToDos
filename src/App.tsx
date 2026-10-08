/**
 * App — renders ConfigError when Supabase is not configured, otherwise mounts
 * the SessionProvider over the Layout (Header + ScheduleGrid + DetailsPanel +
 * TaskList), with the ThemeProvider between SessionProvider and Layout. Data
 * access is NOT gated on auth — the board is visible to anonymous visitors.
 */
import { ConfigError } from './components/ConfigError';
import { Layout } from './components/Layout';
import { SessionProvider } from './context/SessionProvider';
import { ThemeProvider } from './context/ThemeProvider';
import { isConfigured } from './lib/supabase';

export default function App() {
  if (!isConfigured) {
    return <ConfigError />;
  }

  return (
    <SessionProvider>
      <ThemeProvider>
        <Layout />
      </ThemeProvider>
    </SessionProvider>
  );
}
