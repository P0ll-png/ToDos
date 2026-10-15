/**
 * useEventCompletions — the per-account personal event tracker read hook.
 * Mirrors useTaskCompletions EXACTLY (anon has no grant on event_completions,
 * so it is SESSION-AWARE): a signed-out fetch would legitimately return nothing,
 * and the signed-in rule must fall back to the signed-out rule the instant the
 * user signs out.
 *
 * It keys reconcile on `${user_id}:${event_id}` (event_completions has a
 * composite PK and no single `id` column; it carries `replica identity full` so
 * the composite key is reconstructable from a DELETE's `old` payload — see
 * design.md replica-identity contract). The effect is RE-KEYED on the session
 * user id:
 *  - signed out (userId null): tear down any channel and RESET completedEventIds
 *    to an empty set;
 *  - signed in / mount with a user: fetch own rows + subscribe;
 *  - user change (A -> B): the effect re-runs, tearing down A's subscription and
 *    fetching B's rows, never mixing two users' sets.
 *
 * It mirrors useRealtimeTable's fetch + reconcile + focus/visibility self-heal
 * and poll fallback, but scoped to the signed-in user. The optimistic toggle
 * (markEventDone/unmarkEventDone) is reconciled idempotently on the Set, so the
 * client's own INSERT/DELETE self-echo converges regardless of arrival order.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { realtimeFallback, supabase } from '../lib/supabase';
import { useSession } from '../context/SessionProvider';
import type { EventCompletion, EventCompletionRow } from '../lib/types';

function rowToCompletion(row: EventCompletionRow): EventCompletion {
  return {
    userId: row.user_id,
    eventId: row.event_id,
    completedAt: row.completed_at,
  };
}

export interface EventCompletionsState {
  /** The set of event ids the signed-in user has marked done (empty when out). */
  completedEventIds: Set<string>;
  /** The raw completion rows (domain shape), for callers that need them. */
  rows: EventCompletion[];
  /** Optimistically add an event id to the local set (reverted on error). */
  addLocal: (eventId: string) => void;
  /** Optimistically remove an event id from the local set (reverted on error). */
  removeLocal: (eventId: string) => void;
}

export function useEventCompletions(pollMs = 15000): EventCompletionsState {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [rows, setRows] = useState<EventCompletion[]>([]);

  const addLocal = useCallback((eventId: string) => {
    setRows((prev) =>
      prev.some((r) => r.eventId === eventId)
        ? prev
        : [...prev, { userId: userIdRef.current ?? '', eventId, completedAt: null }],
    );
  }, []);
  const removeLocal = useCallback((eventId: string) => {
    setRows((prev) => prev.filter((r) => r.eventId !== eventId));
  }, []);

  // Keep the latest user id available to addLocal without re-creating it.
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  const fetchOwn = useCallback(async (uid: string): Promise<void> => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('event_completions')
      .select('*')
      .eq('user_id', uid);
    if (error) return;
    setRows((data as EventCompletionRow[]).map(rowToCompletion));
  }, []);

  useEffect(() => {
    // Signed out: no grant, so reset to empty and subscribe to nothing.
    if (!supabase || userId == null) {
      setRows([]);
      return;
    }

    const client = supabase;
    const uid = userId;
    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer != null) return;
      pollTimer = setInterval(() => {
        void fetchOwn(uid);
      }, pollMs);
    };

    void fetchOwn(uid);

    const keyOf = (r: Partial<EventCompletionRow> | null): string | null => {
      if (!r || r.user_id == null || r.event_id == null) return null;
      return `${r.user_id}:${r.event_id}`;
    };

    const reconcile = (
      payload: RealtimePostgresChangesPayload<EventCompletionRow>,
    ) => {
      if (!active) return;
      setRows((prev) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as EventCompletionRow;
          const key = keyOf(row);
          if (key == null) return prev;
          if (prev.some((r) => `${r.userId}:${r.eventId}` === key)) {
            return prev.map((r) =>
              `${r.userId}:${r.eventId}` === key ? rowToCompletion(row) : r,
            );
          }
          return [...prev, rowToCompletion(row)];
        }
        if (payload.eventType === 'UPDATE') {
          const row = payload.new as EventCompletionRow;
          const key = keyOf(row);
          if (key == null) return prev;
          return prev.map((r) =>
            `${r.userId}:${r.eventId}` === key ? rowToCompletion(row) : r,
          );
        }
        if (payload.eventType === 'DELETE') {
          const oldKey = keyOf(payload.old as Partial<EventCompletionRow>);
          if (oldKey == null) return prev;
          return prev.filter((r) => `${r.userId}:${r.eventId}` !== oldKey);
        }
        return prev;
      });
    };

    const topic = `rt:event_completions:${uid}:${Math.random()
      .toString(36)
      .slice(2)}`;
    const channel: RealtimeChannel = client
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_completions',
          filter: `user_id=eq.${uid}`,
        },
        reconcile,
      )
      .subscribe((channelStatus) => {
        if (
          channelStatus === 'CHANNEL_ERROR' ||
          channelStatus === 'TIMED_OUT'
        ) {
          startPolling();
        }
      });

    if (realtimeFallback) startPolling();

    const onFocus = () => {
      void fetchOwn(uid);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchOwn(uid);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      if (pollTimer != null) clearInterval(pollTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      void client.removeChannel(channel);
    };
    // Re-key on the user id: a sign-out/sign-in or user switch re-runs this.
  }, [userId, pollMs, fetchOwn]);

  const completedEventIds = useRef<Set<string>>(new Set());
  // Recompute the id set from rows on each render (cheap; rows is small).
  completedEventIds.current = new Set(rows.map((r) => r.eventId));

  return {
    completedEventIds: completedEventIds.current,
    rows,
    addLocal,
    removeLocal,
  };
}
