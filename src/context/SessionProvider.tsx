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

  const fetchProfile = useCallback(async (userId: string): Promise<void> => {
    if (!supabase) return;
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
    // Row still missing after retry: default to member so the app stays usable.
    if (currentUserId.current !== userId) return;
    setProfile({
      id: userId,
      name: '',
      email: session?.user.email ?? '',
      role: 'member',
      themePreferences: normalizePrefs(null),
    });
  }, [session]);

  const applySession = useCallback(
    (next: Session | null) => {
      setSession(next);
      const userId = next?.user.id ?? null;
      currentUserId.current = userId;
      if (userId) {
        void fetchProfile(userId);
      } else {
        setProfile(null);
      }
    },
    [fetchProfile],
  );

  const refreshProfile = useCallback(async () => {
    const userId = currentUserId.current;
    if (userId) await fetchProfile(userId);
  }, [fetchProfile]);

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
    // applySession is stable via useCallback; re-subscribing on identity change
    // is intentional and safe (the cleanup unsubscribes first).
  }, [applySession]);

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
