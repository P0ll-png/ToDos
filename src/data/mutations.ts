/**
 * mutations.ts — thin write wrappers that TRUST RLS for authorization. They
 * NEVER check a client-side role: the only authorization boundary is the
 * Supabase policy set (is_officer() for subjects/slots/tasks, Policy B for role
 * changes). The UI hides controls as convenience only.
 *
 * There is no optimistic UI. Each wrapper returns a MutationResult; callers map
 * a denial (RLS/permission) to "Only officers can do that" and any other
 * failure to "Couldn't save, try again", applying no local state change on
 * error. Realtime (or the fallback poll) is what reconciles successful writes.
 */
import { supabase } from '../lib/supabase';
import type { TaskStatus, UserRole } from '../lib/types';

export type MutationError = 'not-configured' | 'denied' | 'network';

export interface MutationResult {
  ok: boolean;
  error?: MutationError;
}

/** User-facing copy for each failure mode. */
export const MUTATION_MESSAGES: Record<MutationError, string> = {
  'not-configured': "Couldn't save, try again",
  denied: 'Only officers can do that',
  network: "Couldn't save, try again",
};

/**
 * Postgres RLS denials surface as PostgrestError. A row that fails a policy's
 * USING is simply not matched (no error, zero rows); a failed WITH CHECK or a
 * missing table privilege raises an error whose code is in the 42xxx class
 * (42501 insufficient_privilege) or carries an RLS message. We classify any
 * such error as 'denied' and everything else as 'network'.
 */
function classify(error: { code?: string; message?: string } | null): MutationError {
  if (!error) return 'network';
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  if (
    code === '42501' ||
    code.startsWith('42') ||
    message.includes('row-level security') ||
    message.includes('row level security') ||
    message.includes('policy') ||
    message.includes('permission denied')
  ) {
    return 'denied';
  }
  return 'network';
}

interface AddTaskInput {
  subjectId: string;
  title: string;
  notes?: string;
  givenDate?: string; // 'YYYY-MM-DD'; omit to use the DB default (current_date)
  deadline?: string | null; // 'YYYY-MM-DD' or null
  createdBy?: string | null; // the officer's profile id
}

export async function addTask(input: AddTaskInput): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const row: Record<string, unknown> = {
    subject_id: input.subjectId,
    title: input.title,
    notes: input.notes ?? '',
  };
  if (input.givenDate !== undefined) row.given_date = input.givenDate;
  if (input.deadline !== undefined) row.deadline = input.deadline;
  if (input.createdBy !== undefined) row.created_by = input.createdBy;
  const { error } = await supabase.from('tasks').insert(row);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

export async function removeTask(taskId: string): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

interface UpsertSubjectInput {
  id?: string;
  name: string;
  room?: string;
  color?: string | null;
}

export async function upsertSubject(
  input: UpsertSubjectInput,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const row: Record<string, unknown> = {
    name: input.name,
    room: input.room ?? '',
    color: input.color ?? null,
  };
  if (input.id !== undefined) row.id = input.id;
  const { error } = await supabase.from('subjects').upsert(row);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

export async function removeSubject(subjectId: string): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', subjectId);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

interface ScheduleSlotInput {
  id?: string;
  subjectId: string;
  day: number; // 1=Mon .. 5=Fri
  startTime: string; // 'HH:MM' / 'HH:MM:SS'
  endTime: string;
}

export async function upsertScheduleSlot(
  input: ScheduleSlotInput,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const row: Record<string, unknown> = {
    subject_id: input.subjectId,
    day: input.day,
    start_time: input.startTime,
    end_time: input.endTime,
  };
  if (input.id !== undefined) row.id = input.id;
  const { error } = await supabase.from('schedule_slots').upsert(row);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

export async function removeScheduleSlot(
  slotId: string,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('schedule_slots')
    .delete()
    .eq('id', slotId);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

/**
 * setRole — promote/demote. Authorization is Policy B (profiles_update_officer):
 * only an officer's update passes WITH CHECK is_officer(). A member calling this
 * for their own id is rejected because changing role fails profiles_update_self's
 * WITH CHECK (role = current_role_of) too. We issue the bare update and trust the
 * policy; no client role check.
 */
export async function setRole(
  userId: string,
  role: UserRole,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}
