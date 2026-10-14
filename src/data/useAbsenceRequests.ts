/**
 * useAbsenceRequests — refetch-on-demand reads for the Absences page (design
 * OD-4: the absence tables are deliberately NOT published to Realtime because
 * they carry medical-adjacent data; a wide, row-dependent subscription would
 * broaden the blast radius of any future policy regression). Instead this hook
 * refetches on mount, on window focus, and whenever a mutation signals success
 * via the returned `refetch`.
 *
 * Two modes:
 *  - member mode (`mode: 'member'`): selects the caller's own rows. RLS
 *    (ar_select) already returns only theirs, so no client filter is needed.
 *  - officer mode (`mode: 'officer'`): selects ALL rows and sources each
 *    student's display name through an EMBEDDED profiles relationship.
 *
 * PRIVACY — Profiles-embed rule (mandatory, design Data layer):
 *   absence_requests has TWO foreign keys to profiles (user_id = the student,
 *   reviewed_by = the reviewing officer), so a bare `profiles(name)` embed is
 *   ambiguous and PostgREST errors at runtime. The embed is therefore
 *   disambiguated by the FK constraint name and selects `name` ONLY — never
 *   `profiles(*)` and never `email` — because `profiles_read` is `using(true)`
 *   and would otherwise expose a student's email next to sensitive data:
 *       student:profiles!absence_requests_user_id_fkey(name)
 *   reviewed_by is intentionally left unembedded (the inbox does not display the
 *   reviewing officer's name).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AbsenceRequest, AbsenceRequestRow } from '../lib/types';
import type { DataStatus } from './useRealtimeTable';

export type AbsenceMode = 'member' | 'officer';

export interface AbsenceRequestsState {
  data: AbsenceRequest[];
  status: DataStatus;
  /** Retry after an error (resets to loading, then refetches). */
  retry: () => void;
  /** Refetch in place without flipping back to the loading state. */
  refetch: () => void;
}

/**
 * The embedded relationship shape in officer mode. `student` is the single
 * profiles row joined via the user_id FK; we select only its `name`.
 */
type OfficerRow = AbsenceRequestRow & {
  student: { name: string } | null;
};

function rowToRequest(
  row: AbsenceRequestRow | OfficerRow,
  studentName?: string | null,
): AbsenceRequest {
  return {
    id: row.id,
    userId: row.user_id,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    subjectIds: row.subject_ids ?? [],
    allClasses: row.all_classes,
    reasonCategory: row.reason_category,
    explanation: row.explanation,
    status: row.status,
    officerRemark: row.officer_remark,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    ...(studentName != null ? { studentName } : {}),
  };
}

// Member mode selects the plain row set; officer mode disambiguates the
// student embed by FK constraint name and selects ONLY name (privacy).
const MEMBER_SELECT = '*';
const OFFICER_SELECT = '*, student:profiles!absence_requests_user_id_fkey(name)';

export function useAbsenceRequests(mode: AbsenceMode): AbsenceRequestsState {
  const [data, setData] = useState<AbsenceRequest[]>([]);
  const [status, setStatus] = useState<DataStatus>('loading');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const fetchAll = useCallback(async (): Promise<void> => {
    if (!supabase) {
      setData([]);
      setStatus('ready');
      return;
    }
    const officer = modeRef.current === 'officer';
    const { data: rows, error } = await supabase
      .from('absence_requests')
      .select(officer ? OFFICER_SELECT : MEMBER_SELECT)
      .order('created_at', { ascending: false });
    if (error) {
      setStatus('error');
      return;
    }
    if (officer) {
      const list = (rows as unknown as OfficerRow[]).map((r) =>
        rowToRequest(r, r.student?.name ?? ''),
      );
      setData(list);
    } else {
      const list = (rows as unknown as AbsenceRequestRow[]).map((r) =>
        rowToRequest(r),
      );
      setData(list);
    }
    setStatus('ready');
  }, []);

  // Fetch on mount and whenever the mode changes.
  useEffect(() => {
    void fetchAll();
    const onFocus = () => {
      void fetchAll();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchAll, mode]);

  const retry = useCallback(() => {
    setStatus('loading');
    void fetchAll();
  }, [fetchAll]);

  const refetch = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  return { data, status, retry, refetch };
}
