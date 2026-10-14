/**
 * useRealtimeTable — the shared engine behind useSubjects / useScheduleSlots /
 * useTasks. Each hook is its own module (per the component tree) but delegates
 * the identical fetch + Realtime-reconcile + fallback behavior here so the
 * reconcile rules live in one tested place.
 *
 * Behavior contract:
 *  - Fetch `select *` on mount UNCONDITIONALLY — no auth gate. Anonymous read
 *    is the whole point; the hook never looks at the session.
 *  - Subscribe to a postgres_changes Realtime channel and reconcile strictly by
 *    `id`: INSERT appends, UPDATE replaces-by-id from the `new` payload, DELETE
 *    filters-by-id from the `old` payload. Under the default replica identity
 *    the PK is always present in both payloads (see design.md replica-identity
 *    contract), so no other column is read off `old`.
 *  - Fix #4 (deterministic fallback). The poll fallback is driven by (a) the
 *    VITE_REALTIME_FALLBACK env flag and/or (b) the channel OBSERVABLY entering
 *    an errored / CLOSED / TIMED_OUT state — NOT by a "no events within N
 *    seconds" idle timer. When active it refetches every `pollMs` (15s).
 *  - An ALWAYS-ON reconciliation refetches on window 'focus' and
 *    'visibilitychange' (-> visible) so a missed event self-heals regardless of
 *    transport, whether or not the fallback poll is running.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { realtimeFallback, supabase } from '../lib/supabase';

export type DataStatus = 'loading' | 'ready' | 'error';

export interface DataHookState<T> {
  data: T[];
  status: DataStatus;
  /** Manual refetch, surfaced for the inline retry on an error state. */
  retry: () => void;
}

interface Identified {
  id: string;
}

/**
 * @param table   the Postgres table name (also the Realtime topic suffix).
 * @param mapRow  maps a raw snake_case row to the camelCase domain shape.
 * @param pollMs  refetch interval while the fallback is active (default 15s).
 */
export function useRealtimeTable<Row extends Identified, T extends Identified>(
  table: string,
  mapRow: (row: Row) => T,
  pollMs = 15000,
): DataHookState<T> {
  // The base hook keys strictly by `id`, both for the row payload and the
  // mapped domain item. It delegates to the keyed engine with id extractors so
  // the single reconcile implementation lives in one tested place; its
  // id-keyed behavior and tests are unchanged.
  return useRealtimeTableKeyed<Row, T>(
    table,
    mapRow,
    (row) => row.id,
    (item) => item.id,
    pollMs,
  );
}

/**
 * useRealtimeTableKeyed — the generalized engine behind useRealtimeTable. It is
 * identical in behavior but reconciles by an arbitrary string key instead of
 * assuming an `id` column, so a composite-PK table (task_completions, keyed on
 * `${user_id}:${task_id}`) can reuse the same fetch + reconcile + fallback.
 *
 * `keyOfRow` extracts the key from a raw Realtime payload row (used for
 * INSERT/UPDATE reconcile and, from the `old` payload, for DELETE). `keyOfItem`
 * extracts the same key from a mapped domain item so the two can be matched.
 * Under the default replica identity only the PK is guaranteed in the `old`
 * payload; task_completions carries `replica identity full` (see design.md
 * replica-identity contract) so a composite key is always reconstructable.
 *
 * Like the base, this hook does NOT look at the session; a session-aware caller
 * (useTaskCompletions) layers mount/teardown on top of it.
 */
export function useRealtimeTableKeyed<Row, T>(
  table: string,
  mapRow: (row: Row) => T,
  keyOfRow: (row: Row) => string | null,
  keyOfItem: (item: T) => string,
  pollMs = 15000,
): DataHookState<T> {
  const [data, setData] = useState<T[]>([]);
  const [status, setStatus] = useState<DataStatus>('loading');
  // mapRow/key extractors are captured in refs so the fetch/subscribe effect
  // does not need them in its dependency array (callers pass module-level fns,
  // but this is safe regardless of identity stability).
  const mapRef = useRef(mapRow);
  mapRef.current = mapRow;
  const keyOfRowRef = useRef(keyOfRow);
  keyOfRowRef.current = keyOfRow;
  const keyOfItemRef = useRef(keyOfItem);
  keyOfItemRef.current = keyOfItem;

  const fetchAll = useCallback(async (): Promise<void> => {
    if (!supabase) {
      // Unconfigured: App renders ConfigError before any hook mounts, but stay
      // safe and report an empty ready state rather than spinning forever.
      setData([]);
      setStatus('ready');
      return;
    }
    const { data: rows, error } = await supabase.from(table).select('*');
    if (error) {
      setStatus('error');
      return;
    }
    setData((rows as Row[]).map((r) => mapRef.current(r)));
    setStatus('ready');
  }, [table]);

  // Initial unconditional fetch + Realtime subscription + fallback poll.
  useEffect(() => {
    if (!supabase) {
      setData([]);
      setStatus('ready');
      return;
    }

    // Capture a non-null local so the narrowing survives into the cleanup
    // closure (TS does not keep the module-level narrowing across callbacks).
    const client = supabase;
    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer != null) return;
      pollTimer = setInterval(() => {
        void fetchAll();
      }, pollMs);
    };

    void fetchAll();

    // The payload is typed with the loose index-signature shape the Realtime
    // SDK requires; rows are cast to the caller's Row (the mapRow / keyOf fns
    // are the only readers and know the concrete columns).
    const reconcile = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>,
    ) => {
      if (!active) return;
      setData((prev) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as Row;
          const key = keyOfRowRef.current(row);
          if (key == null) return prev;
          if (prev.some((item) => keyOfItemRef.current(item) === key)) {
            // Already present (e.g. arrived via a concurrent refetch): replace.
            return prev.map((item) =>
              keyOfItemRef.current(item) === key ? mapRef.current(row) : item,
            );
          }
          return [...prev, mapRef.current(row)];
        }
        if (payload.eventType === 'UPDATE') {
          const row = payload.new as Row;
          const key = keyOfRowRef.current(row);
          if (key == null) return prev;
          return prev.map((item) =>
            keyOfItemRef.current(item) === key ? mapRef.current(row) : item,
          );
        }
        if (payload.eventType === 'DELETE') {
          // The key must be reconstructable from the `old` payload: the PK
          // under default identity, or any column under `replica identity full`.
          const oldKey = keyOfRowRef.current(payload.old as Row);
          if (oldKey == null) return prev;
          return prev.filter((item) => keyOfItemRef.current(item) !== oldKey);
        }
        return prev;
      });
    };

    // Unique topic per mount: a quick unmount/remount (React StrictMode in dev,
    // or any remount) must not collide with a still-closing channel of the same
    // name, which can trigger a reconnect storm.
    const topic = `rt:${table}:${Math.random().toString(36).slice(2)}`;
    const channel: RealtimeChannel = client
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        reconcile,
      )
      .subscribe((channelStatus) => {
        // Observable-state fallback (fix #4): a channel ERROR or TIMEOUT means
        // Realtime is not delivering, so switch to the poll. This is NOT an idle
        // timer — we react only to the transport's own reported state.
        //
        // NOTE: 'CLOSED' is deliberately NOT treated as a failure. Supabase emits
        // CLOSED during normal teardown and transient reconnects; treating it as
        // "broken" started a false poll on every routine reconnect and, combined
        // with reconnect churn after a write, produced a re-render storm. We only
        // react to genuine error states.
        if (
          channelStatus === 'CHANNEL_ERROR' ||
          channelStatus === 'TIMED_OUT'
        ) {
          startPolling();
        }
      });

    // Config-driven fallback (fix #4): if the operator set VITE_REALTIME_FALLBACK
    // we poll from the start, independent of channel state.
    if (realtimeFallback) startPolling();

    // Always-on self-heal: refetch when the tab regains focus or becomes
    // visible, so a missed event is reconciled regardless of transport.
    const onFocus = () => {
      void fetchAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchAll();
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
  }, [fetchAll, pollMs, table]);

  const retry = useCallback(() => {
    setStatus('loading');
    void fetchAll();
  }, [fetchAll]);

  return { data, status, retry };
}
