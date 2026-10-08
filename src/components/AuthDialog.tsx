/**
 * AuthDialog — email/password sign-in + sign-up and Google OAuth. Opened from
 * the Header; sign-in is never forced (anonymous read works without it). All
 * controls are real <button>s so they are keyboard-focusable with the global
 * :focus-visible ring. Supabase errors are shown inline.
 */
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        onClose();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        // When email confirmation is on, no session is returned yet.
        if (data.session) {
          onClose();
        } else {
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch {
      setError("Couldn't reach the server, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      // On success the browser redirects to Google; detectSessionInUrl
      // finishes the round-trip when it returns.
      if (oauthError) {
        setError(oauthError.message);
        setBusy(false);
      }
    } catch {
      setError("Couldn't start Google sign-in, try again.");
      setBusy(false);
    }
  }

  const titleId = 'auth-dialog-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={{
        padding: '1.5rem',
        maxWidth: '22rem',
        width: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
      }}
    >
      <h2 id={titleId} style={{ marginTop: 0 }}>
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </h2>

      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ display: 'block', marginBottom: '0.25rem' }}>
            Email
          </span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '1rem' }}>
          <span style={{ display: 'block', marginBottom: '0.25rem' }}>
            Password
          </span>
          <input
            type="password"
            value={password}
            autoComplete={
              mode === 'signin' ? 'current-password' : 'new-password'
            }
            required
            minLength={6}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 1rem' }}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" style={{ color: 'var(--muted)', margin: '0 0 1rem' }}>
            {notice}
          </p>
        )}

        <button type="submit" disabled={busy} style={accentButtonStyle}>
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        style={{ ...secondaryButtonStyle, marginTop: '0.75rem' }}
      >
        Continue with Google
      </button>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '1rem',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setNotice(null);
          }}
          style={linkButtonStyle}
        >
          {mode === 'signin'
            ? 'Need an account? Sign up'
            : 'Have an account? Sign in'}
        </button>
        <button type="button" onClick={onClose} style={linkButtonStyle}>
          Close
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  font: 'inherit',
};

const accentButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const linkButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--accent-text)',
  padding: 0,
  font: 'inherit',
  textDecoration: 'underline',
};
