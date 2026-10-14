/**
 * useEvents — unconditional fetch + Realtime reconcile for `events`. Exactly
 * the useTasks pattern: a thin wrapper over useRealtimeTable. Public read for
 * everyone (anon included); an officer INSERT/UPDATE/DELETE reconciles here and
 * every connected client re-derives its right-hand list, calendar chips, and
 * the schedule-cell assessment badge instantly.
 */
import type { EventItem, EventRow } from '../lib/types';
import { useRealtimeTable, type DataHookState } from './useRealtimeTable';

function rowToEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    subjectId: row.subject_id,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    notes: row.notes,
    createdBy: row.created_by,
  };
}

export function useEvents(pollMs = 15000): DataHookState<EventItem> {
  return useRealtimeTable<EventRow, EventItem>('events', rowToEvent, pollMs);
}
