/**
 * useScheduleSlots — unconditional fetch + Realtime reconcile for
 * `schedule_slots`. See useRealtimeTable for the shared reconcile + fallback.
 */
import type { ScheduleSlot, ScheduleSlotRow } from '../lib/types';
import { useRealtimeTable, type DataHookState } from './useRealtimeTable';

function rowToSlot(row: ScheduleSlotRow): ScheduleSlot {
  return {
    id: row.id,
    subjectId: row.subject_id,
    day: row.day,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

export function useScheduleSlots(pollMs = 15000): DataHookState<ScheduleSlot> {
  return useRealtimeTable<ScheduleSlotRow, ScheduleSlot>(
    'schedule_slots',
    rowToSlot,
    pollMs,
  );
}
