/**
 * SessionProvider — exposes the Supabase auth session, the matching profiles
 * row, and the derived role. It NEVER gates data access on auth: anonymous
 * visitors render the full read-only app (profile is null, role is null). The
 * data hooks fetch regardless of session.
 *
 * On a session it fetches the profiles row for auth.uid(). Because
 * handle_new_user() creates that row via an AFTER INSERT trigger, a brand-new
 * signup can briefly race the first fetch; we retry once after a short delay,
 * then fall back to a member default so the UI stays usable.
 *
 * When supabase is null (unconfigured) the provider no-ops safely — App renders
 * <ConfigError /> before this mounts anyway.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { normalizePrefs } from '../lib/theme-core';
import type { Profile, ProfileRow, UserRole } from '../lib/types';

interface SessionContextValue {
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  isOfficer: boolean;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const PROFILE_RETRY_DELAY_MS = 600;

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    themePreferences: normalizePrefs(row.theme_preferences),
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Track the latest user id so an in-flight fetch for a stale user is ignored.
  const currentUserId = useRef<string | null>(null);
  // Guard against concurrent/duplicate fetches for the SAME user. On first load
  // getSession() and the first onAuthStateChange both fire while currentUserId
  // is still null, so both would pass the id-change guard and launch a fetch;
  // the two racing fetches could interleave and briefly set the member fallback
  // over a real officer profile, flickering officer-only controls. We let only
  // one fetch per user id be in flight.
  const fetchingFor = useRef<string | null>(null);

  const fetchProfile = useCallback(
    async (userId: string, email: string): Promise<void> => {
      if (!supabase) return;
      // Collapse duplicate in-flight fetches for the same user.
      if (fetchingFor.current === userId) return;
      fetchingFor.current = userId;
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role, theme_preferences')
            .eq('id', userId)
            .maybeSingle();
          // The user changed (sign-out or switch) while we awaited — drop result.
          if (currentUserId.current !== userId) return;
          if (error) break;
          if (data) {
            setProfile(rowToProfile(data as ProfileRow));
            return;
          }
          // No row yet: likely handle_new_user() trigger lag on fresh signup.
          if (attempt === 0) await delay(PROFILE_RETRY_DELAY_MS);
        }
        // Row still missing after retry. Only fall back to a member default for
        // a genuinely new profile — NEVER overwrite a profile we already loaded
        // for this same user, or a transient empty read would demote the UI
        // (flickering officer-only controls off and on).
        if (currentUserId.current !== userId) return;
        setProfile((prev) => {
          if (prev && prev.id === userId) return prev;
          return {
            id: userId,
            name: '',
            email,
            role: 'member',
            themePreferences: normalizePrefs(null),
          };
        });
      } finally {
        if (fetchingFor.current === userId) fetchingFor.current = null;
      }
    },
    [],
  );

  const applySession = useCallback(
    (next: Session | null) => {
      const userId = next?.user.id ?? null;
      // Ignore auth events that don't change the user (token refresh, tab
      // re-focus re-emitting SIGNED_IN): re-fetching would churn the profile
      // object and re-render the whole tree. Only act on an actual id change.
      if (userId === currentUserId.current) {
        // Keep the session object fresh (new access token) without re-fetching
        // the profile; this does not change identity-derived state.
        setSession(next);
        return;
      }
      currentUserId.current = userId;
      setSession(next);
      if (userId) {
        void fetchProfile(userId, next?.user.email ?? '');
      } else {
        setProfile(null);
      }
    },
    [fetchProfile],
  );

  const refreshProfile = useCallback(async () => {
    const userId = currentUserId.current;
    // Force a fresh read even if a fetch just ran (explicit user action, e.g.
    // after being promoted): clear the in-flight guard first.
    fetchingFor.current = null;
    if (userId) await fetchProfile(userId, session?.user.email ?? '');
  }, [fetchProfile, session]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) applySession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // Mount once: applySession reads/writes the currentUserId ref, so its
    // identity changing must NOT re-subscribe. Deliberately empty deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      profile,
      role: profile?.role ?? null,
      isOfficer: profile?.role === 'officer',
      refreshProfile,
    }),
    [session, profile, refreshProfile],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
