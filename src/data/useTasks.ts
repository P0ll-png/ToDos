/**
 * useTasks — unconditional fetch + Realtime reconcile for `tasks`. This is the
 * hot hook: glow derivation and both lists read its live array, so an officer
 * INSERT/UPDATE/DELETE reconciles here and the UI re-derives instantly for
 * every connected client, including anonymous ones. See useRealtimeTable for
 * the shared reconcile + deterministic fallback (fix #4).
 */
import type { Task, TaskRow } from '../lib/types';
import { useRealtimeTable, type DataHookState } from './useRealtimeTable';

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    notes: row.notes,
    givenDate: row.given_date,
    deadline: row.deadline,
    createdBy: row.created_by,
    status: row.status,
  };
}

export function useTasks(pollMs = 15000): DataHookState<Task> {
  return useRealtimeTable<TaskRow, Task>('tasks', rowToTask, pollMs);
}
