/**
 * useTaskCompletions — the per-account personal tracker read hook. Unlike the
 * public board hooks (useTasks/useEvents), this one is SESSION-AWARE: anon has
 * no grant on task_completions, so a signed-out fetch would legitimately return
 * nothing, and the signed-in rule for subjectGlows must fall back to the
 * signed-out rule the instant the user signs out.
 *
 * It keys reconcile on `${user_id}:${task_id}` (task_completions has a composite
 * PK and no single `id` column; it carries `replica identity full` so the
 * composite key is reconstructable from a DELETE's `old` payload — see design.md
 * replica-identity contract). The effect is RE-KEYED on the session user id:
 *  - signed out (userId null): tear down any channel and RESET completedTaskIds
 *    to an empty set, so subjectGlows reverts to "any pending glows";
 *  - signed in / mount with a user: fetch own rows + subscribe;
 *  - user change (A -> B): the effect re-runs, tearing down A's subscription and
 *    fetching B's rows, never mixing two users' sets.
 *
 * It mirrors useRealtimeTable's fetch + reconcile + focus/visibility self-heal
 * and poll fallback, but scoped to the signed-in user. The optimistic toggle
 * (markTaskDone/unmarkTaskDone) is reconciled idempotently on the Set, so the
 * client's own INSERT/DELETE self-echo converges regardless of arrival order.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { realtimeFallback, supabase } from '../lib/supabase';
import { useSession } from '../context/SessionProvider';
import type { TaskCompletion, TaskCompletionRow } from '../lib/types';

function rowToCompletion(row: TaskCompletionRow): TaskCompletion {
  return {
    userId: row.user_id,
    taskId: row.task_id,
    completedAt: row.completed_at,
  };
}

export interface TaskCompletionsState {
  /** The set of task ids the signed-in user has marked done (empty when out). */
  completedTaskIds: Set<string>;
  /** The raw completion rows (domain shape), for callers that need them. */
  rows: TaskCompletion[];
  /** Optimistically add a task id to the local set (reverted on error). */
  addLocal: (taskId: string) => void;
  /** Optimistically remove a task id from the local set (reverted on error). */
  removeLocal: (taskId: string) => void;
}

export function useTaskCompletions(pollMs = 15000): TaskCompletionsState {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [rows, setRows] = useState<TaskCompletion[]>([]);

  const addLocal = useCallback((taskId: string) => {
    setRows((prev) =>
      prev.some((r) => r.taskId === taskId)
        ? prev
        : [...prev, { userId: userIdRef.current ?? '', taskId, completedAt: null }],
    );
  }, []);
  const removeLocal = useCallback((taskId: string) => {
    setRows((prev) => prev.filter((r) => r.taskId !== taskId));
  }, []);

  // Keep the latest user id available to addLocal without re-creating it.
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  const fetchOwn = useCallback(async (uid: string): Promise<void> => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('task_completions')
      .select('*')
      .eq('user_id', uid);
    if (error) return;
    setRows((data as TaskCompletionRow[]).map(rowToCompletion));
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

    const keyOf = (r: Partial<TaskCompletionRow> | null): string | null => {
      if (!r || r.user_id == null || r.task_id == null) return null;
      return `${r.user_id}:${r.task_id}`;
    };

    const reconcile = (
      payload: RealtimePostgresChangesPayload<TaskCompletionRow>,
    ) => {
      if (!active) return;
      setRows((prev) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as TaskCompletionRow;
          const key = keyOf(row);
          if (key == null) return prev;
          if (prev.some((r) => `${r.userId}:${r.taskId}` === key)) {
            return prev.map((r) =>
              `${r.userId}:${r.taskId}` === key ? rowToCompletion(row) : r,
            );
          }
          return [...prev, rowToCompletion(row)];
        }
        if (payload.eventType === 'UPDATE') {
          const row = payload.new as TaskCompletionRow;
          const key = keyOf(row);
          if (key == null) return prev;
          return prev.map((r) =>
            `${r.userId}:${r.taskId}` === key ? rowToCompletion(row) : r,
          );
        }
        if (payload.eventType === 'DELETE') {
          const oldKey = keyOf(payload.old as Partial<TaskCompletionRow>);
          if (oldKey == null) return prev;
          return prev.filter((r) => `${r.userId}:${r.taskId}` !== oldKey);
        }
        return prev;
      });
    };

    const topic = `rt:task_completions:${uid}:${Math.random()
      .toString(36)
      .slice(2)}`;
    const channel: RealtimeChannel = client
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_completions',
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

  const completedTaskIds = useRef<Set<string>>(new Set());
  // Recompute the id set from rows on each render (cheap; rows is small).
  completedTaskIds.current = new Set(rows.map((r) => r.taskId));

  return {
    completedTaskIds: completedTaskIds.current,
    rows,
    addLocal,
    removeLocal,
  };
}
