/**
 * AdminPanel — officers-only promote/demote. Rendered only when isOfficer, but
 * that is convenience: setRole trusts Policy B at the DB. It lists profiles by
 * name and role ONLY (never email, per Security Notes). The demote control on
 * the current user's own row is disabled with a tooltip — a UX guard against the
 * lone-officer lockout, not a security boundary (the SQL still permits it).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { setRole, MUTATION_MESSAGES } from '../data/mutations';
import { useSession } from '../context/SessionProvider';
import type { ProfileRow, UserRole } from '../lib/types';

interface AdminRow {
  id: string;
  name: string;
  role: UserRole;
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const { profile } = useSession();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    // Select only id/name/role — never email.
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, name, role')
      .order('name', { ascending: true });
    if (loadError) {
      setError("Couldn't load members, try again.");
      setRows([]);
    } else {
      setRows(
        (data as Pick<ProfileRow, 'id' | 'name' | 'role'>[]).map((r) => ({
          id: r.id,
          name: r.name,
          role: r.role,
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(id: string, role: UserRole) {
    setBusyId(id);
    setError(null);
    const result = await setRole(id, role);
    if (!result.ok) {
      setError(MUTATION_MESSAGES[result.error ?? 'network']);
    } else {
      await load();
    }
    setBusyId(null);
  }

  const titleId = 'admin-panel-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={{
        padding: '1.5rem',
        maxWidth: '26rem',
        width: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 id={titleId} style={{ margin: 0 }}>
          Members
        </h2>
        <button type="button" onClick={onClose} style={linkButtonStyle}>
          Close
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--danger)', marginTop: '1rem' }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted" style={{ color: 'var(--muted)' }}>
          Loading…
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0' }}>
          {rows.map((row) => {
            const isSelf = row.id === profile?.id;
            const isOfficer = row.role === 'officer';
            return (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span>
                  {row.name || '(no name)'}{' '}
                  <span className="muted" style={{ color: 'var(--muted)' }}>
                    · {row.role}
                  </span>
                </span>
                {isOfficer ? (
                  <button
                    type="button"
                    disabled={isSelf || busyId === row.id}
                    title={
                      isSelf ? "You can't demote yourself" : undefined
                    }
                    onClick={() => changeRole(row.id, 'member')}
                    style={secondaryButtonStyle}
                  >
                    Demote
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => changeRole(row.id, 'officer')}
                    style={accentButtonStyle}
                  >
                    Promote
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const accentButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
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
