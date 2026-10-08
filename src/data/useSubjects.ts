/**
 * useSubjects — unconditional fetch + Realtime reconcile for `subjects`.
 *
 * The hook fetches on mount regardless of auth (anonymous read works) and keeps
 * a normalized array in state. See useRealtimeTable for the shared reconcile +
 * deterministic fallback (fix #4) implementation.
 */
import type { Subject, SubjectRow } from '../lib/types';
import { useRealtimeTable, type DataHookState } from './useRealtimeTable';

function rowToSubject(row: SubjectRow): Subject {
  return {
    id: row.id,
    name: row.name,
    room: row.room,
    color: row.color,
  };
}

export function useSubjects(pollMs = 15000): DataHookState<Subject> {
  return useRealtimeTable<SubjectRow, Subject>('subjects', rowToSubject, pollMs);
}
