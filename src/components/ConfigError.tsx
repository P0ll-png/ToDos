/**
 * ConfigError — shown when Supabase env vars are missing/invalid. It is styled
 * entirely via live CSS tokens applied by the pre-paint bootstrap (var(--bg)
 * etc.), NOT a hardcoded palette. Dark is the automatic fallback only if the
 * bootstrap itself failed.
 */
import { missingConfig } from '../lib/supabase';

export function ConfigError() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '32rem',
          padding: '2rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Configure Supabase</h1>
        <p>
          Class To-Do Board needs a Supabase project to load the schedule and
          tasks. The following environment variable
          {missingConfig.length === 1 ? ' is' : 's are'} missing or invalid:
        </p>
        <ul>
          {missingConfig.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <p className="muted" style={{ color: 'var(--muted)', marginBottom: 0 }}>
          Copy <code>.env.example</code> to <code>.env</code>, fill in your
          project URL and anon key, then restart the dev server. See{' '}
          <code>SETUP.md</code> for details.
        </p>
      </div>
    </div>
  );
}
