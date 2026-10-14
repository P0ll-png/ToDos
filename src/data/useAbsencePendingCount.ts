/**
 * useAbsencePendingCount — a lightweight head-only COUNT of absence requests in
 * the 'pending' state, for the officer pending badge in the nav (design OD-4,
 * FR-4.9). It uses `head: true, count: 'exact'` so no rows are transferred,
 * only the count. Refetched on mount, on window focus, and whenever an officer
 * changes a request's status.
 *
 * The badge lives in Nav while the officer inbox lives on a sibling page
 * (AbsencesPage), so the "after a status change" refetch is delivered through a
 * tiny same-tab event bus (`notifyAbsenceStatusChanged`) — a window CustomEvent,
 * no new dependency and no shared context plumbing.
 *
 * RLS: the badge is only rendered to officers (ar_select returns all rows to an
 * officer); the Nav hides it for non-officers, so a non-officer's own-row count
 * is never displayed.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const PENDING_CHANGED_EVENT = 'absence:pending-changed';

/** Signal that an officer changed a request's status, so the badge refetches. */
export function notifyAbsenceStatusChanged(): void {
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}

export interface AbsencePendingCountState {
  count: number;
  refetch: () => void;
}

export function useAbsencePendingCount(enabled: boolean): AbsencePendingCountState {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async (): Promise<void> => {
    if (!supabase || !enabled) {
      setCount(0);
      return;
    }
    const { count: n, error } = await supabase
      .from('absence_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('status', 'pending');
    if (error) {
      // A transient failure leaves the badge at its last value rather than
      // flashing zero; the next refetch corrects it.
      return;
    }
    setCount(n ?? 0);
  }, [enabled]);

  useEffect(() => {
    void fetchCount();
    const onRefresh = () => {
      void fetchCount();
    };
    window.addEventListener(PENDING_CHANGED_EVENT, onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      window.removeEventListener(PENDING_CHANGED_EVENT, onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, [fetchCount]);

  const refetch = useCallback(() => {
    void fetchCount();
  }, [fetchCount]);

  return { count, refetch };
}
