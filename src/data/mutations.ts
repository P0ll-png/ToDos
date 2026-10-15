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
import { SIGNED_URL_TTL_SECONDS } from '../lib/storage';
import type {
  AbsenceReason,
  AbsenceStatus,
  EventType,
  TaskStatus,
  UserRole,
} from '../lib/types';

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

// ============ events (officer-only; RLS is the sole gate) ============

interface AddEventInput {
  type: EventType;
  title: string;
  subjectId?: string | null; // nullable; '' / undefined -> null
  eventDate: string; // 'YYYY-MM-DD'
  startTime?: string | null; // 'HH:MM' / 'HH:MM:SS' or null
  endTime?: string | null;
  location?: string; // '' default — the column is NOT NULL DEFAULT ''
  notes?: string; // '' default — the column is NOT NULL DEFAULT ''
  createdBy?: string | null; // the officer's profile id
}

/**
 * addEvent — officer-only insert. No client role check: a member/anon attempt
 * is denied by the events_write RLS policy and surfaces MUTATION_MESSAGES.denied
 * ("Only officers can do that"), exactly like addTask. location/notes send ''
 * (never null) because both columns are NOT NULL DEFAULT '' (NIT5).
 */
export async function addEvent(input: AddEventInput): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const row: Record<string, unknown> = {
    type: input.type,
    title: input.title,
    subject_id: input.subjectId ? input.subjectId : null,
    event_date: input.eventDate,
    start_time: input.startTime ? input.startTime : null,
    end_time: input.endTime ? input.endTime : null,
    location: input.location ?? '',
    notes: input.notes ?? '',
  };
  if (input.createdBy !== undefined) row.created_by = input.createdBy;
  const { error } = await supabase.from('events').insert(row);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

interface UpdateEventPatch {
  type?: EventType;
  title?: string;
  subjectId?: string | null;
  eventDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string;
  notes?: string;
}

/** updateEvent — officer-only update. Only the provided fields are patched. */
export async function updateEvent(
  id: string,
  patch: UpdateEventPatch,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const row: Record<string, unknown> = {};
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.subjectId !== undefined) {
    row.subject_id = patch.subjectId ? patch.subjectId : null;
  }
  if (patch.eventDate !== undefined) row.event_date = patch.eventDate;
  if (patch.startTime !== undefined) {
    row.start_time = patch.startTime ? patch.startTime : null;
  }
  if (patch.endTime !== undefined) {
    row.end_time = patch.endTime ? patch.endTime : null;
  }
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { error } = await supabase.from('events').update(row).eq('id', id);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

/** removeEvent — officer-only delete. */
export async function removeEvent(id: string): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase.from('events').delete().eq('id', id);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

// ============ announcements (officer-only; RLS is the sole gate) ============

interface AddAnnouncementInput {
  title: string;
  body?: string; // '' default — the column is NOT NULL DEFAULT ''
  createdBy?: string | null; // the officer's profile id
}

/**
 * addAnnouncement — officer-only insert. No client role check: a member/anon
 * attempt is denied by announcements_insert (with check is_officer()) and
 * surfaces MUTATION_MESSAGES.denied, exactly like addEvent. body sends ''
 * (never null) because the column is NOT NULL DEFAULT ''.
 */
export async function addAnnouncement(
  input: AddAnnouncementInput,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const row: Record<string, unknown> = {
    title: input.title,
    body: input.body ?? '',
  };
  if (input.createdBy !== undefined) row.created_by = input.createdBy;
  const { error } = await supabase.from('announcements').insert(row);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

/** removeAnnouncement — officer-only delete. */
export async function removeAnnouncement(id: string): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

// ============ personal tracker (per-account completions) ============

/**
 * markTaskDone / unmarkTaskDone — the ONE deliberate optimistic path in this
 * module (justified by FR-2.8 cross-device liveness and the low stakes of a
 * self-only toggle; see design.md Error handling). The caller updates its local
 * completedTaskIds set IMMEDIATELY and reverts on a non-ok result; the Realtime
 * reconcile is the source of truth and is idempotent on the Set, so the
 * optimistic guess and the self-echoed INSERT/DELETE converge regardless of
 * arrival order. These write only task_completions — tasks.status is NEVER
 * touched by this path (FR-2.2). RLS (tc_insert/tc_delete, user_id = auth.uid())
 * is the real gate; no client role check.
 */
export async function markTaskDone(
  taskId: string,
  userId: string,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('task_completions')
    .insert({ user_id: userId, task_id: taskId });
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

export async function unmarkTaskDone(
  taskId: string,
  userId: string,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('task_completions')
    .delete()
    .match({ user_id: userId, task_id: taskId });
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

// ============ absences (privacy-critical; RLS is the sole gate) ============

interface CreateAbsenceRequestInput {
  userId: string;
  dateFrom: string; // 'YYYY-MM-DD'
  dateTo: string; // 'YYYY-MM-DD'
  subjectIds: string[];
  allClasses: boolean;
  reasonCategory: AbsenceReason;
  explanation?: string;
  /** Optional evidence link (any URL). Omitted / null stores NULL. */
  evidenceUrl?: string | null;
}

/**
 * The create result carries the new request id for the caller's convenience
 * (e.g. a follow-up read or future use). It is no longer used to upload
 * attachments — the evidence link rides on the request row itself.
 */
export interface CreateAbsenceResult extends MutationResult {
  id?: string;
}

/**
 * createAbsenceRequest — member insert. It writes ONLY the member-owned fields
 * (user_id, date_from, date_to, subject_ids, all_classes, reason_category,
 * explanation, evidence_url) and NEVER status/officer_remark/reviewed_by/
 * reviewed_at: the DB defaults supply status='pending' and leave the
 * officer/review fields NULL, so ar_insert's WITH CHECK
 * (user_id = auth.uid() and status = 'pending') is always satisfied for a
 * legitimate submit. Returns the new id (via `select`) for the caller's
 * convenience.
 */
export async function createAbsenceRequest(
  input: CreateAbsenceRequestInput,
): Promise<CreateAbsenceResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { data, error } = await supabase
    .from('absence_requests')
    .insert({
      user_id: input.userId,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      subject_ids: input.subjectIds,
      all_classes: input.allClasses,
      reason_category: input.reasonCategory,
      explanation: input.explanation ?? '',
      evidence_url: input.evidenceUrl ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: classify(error) };
  return { ok: true, id: (data as { id: string }).id };
}

interface UpdateAbsenceStatusInput {
  status: AbsenceStatus;
  officerRemark?: string | null;
  reviewedBy?: string | null;
}

/**
 * updateAbsenceStatus — the officer path. RLS (ar_update_officer, is_officer())
 * is the sole gate; a member's update is denied. Writes the review fields the
 * officer owns.
 */
export async function updateAbsenceStatus(
  id: string,
  input: UpdateAbsenceStatusInput,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('absence_requests')
    .update({
      status: input.status,
      officer_remark: input.officerRemark ?? null,
      reviewed_by: input.reviewedBy ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

/**
 * deleteAbsenceRequest — member-while-pending path. RLS (ar_delete_member)
 * enforces the own-and-pending window; the UI hides delete once not pending as
 * convenience only. The evidence link is a column on the request row, so it is
 * removed with the row — there is nothing else to clean up.
 */
export async function deleteAbsenceRequest(id: string): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { error } = await supabase
    .from('absence_requests')
    .delete()
    .eq('id', id);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

// ============ reviewers (shared study files; RLS is the sole gate) ============

interface CreateReviewerInput {
  uploaderId: string;
  subjectId: string;
  title: string;
  description?: string;
  path: string; // {uploader_id}/{id}/{safeName}, built BEFORE upload
  id: string; // crypto.randomUUID() generated BEFORE upload (design)
  file: File;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * createReviewer — orphan-safe upload-then-insert for a shared reviewer.
 *
 * Ordering (design Data layer → createReviewer): the row `id` is generated
 * client-side BEFORE the upload and the path is `{uploader_id}/{id}/{safeName}`
 * (buildStoragePath), so the object is deterministically locatable from the row.
 *   1. upload the file to the 'reviewers' bucket;
 *   2. if the upload fails, insert NOTHING;
 *   3. insert the row WITH that explicit id + storage_path (rv_insert requires
 *      uploader_id = auth.uid());
 *   4. if the insert fails AFTER a successful upload, remove the just-uploaded
 *      object so no orphan is left (the row's absence makes the path otherwise
 *      unreconstructable).
 *
 * RLS (rv_insert + rv_obj_insert own-folder) is the real gate; no client role
 * check. A member/anon with a forged uploader_id is denied by WITH CHECK.
 */
export async function createReviewer(
  input: CreateReviewerInput,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };

  const upload = await supabase.storage
    .from('reviewers')
    .upload(input.path, input.file, { contentType: input.mimeType });
  if (upload.error) {
    return { ok: false, error: classify(upload.error as { message?: string }) };
  }

  const { error } = await supabase.from('reviewers').insert({
    id: input.id,
    uploader_id: input.uploaderId,
    subject_id: input.subjectId,
    title: input.title,
    description: input.description ?? null,
    storage_path: input.path,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });
  if (error) {
    // Insert failed after a successful upload — clean up the orphaned object so
    // no file is left behind with no row to reconstruct its path. Best-effort:
    // the row-insert error is the one surfaced to the user.
    await supabase.storage.from('reviewers').remove([input.path]);
    return { ok: false, error: classify(error) };
  }
  return { ok: true };
}

/**
 * deleteReviewer — orphan-safe delete-object-then-row (design Data layer →
 * deleteReviewer). The storage object is removed FIRST so a storage failure
 * aborts BEFORE the row is deleted — leaving the card in the UI for a retry
 * rather than an orphaned-but-still-mintable file with no row to locate it. A
 * storage "not found" is treated as success (idempotent) so a half-completed
 * prior delete can still be cleaned up. RLS (rv_delete owner-or-officer +
 * rv_obj_delete) is the real authorization gate for both steps; the UI's
 * owner/officer check is convenience only.
 */
export async function deleteReviewer(
  id: string,
  storagePath: string,
): Promise<MutationResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };

  const removal = await supabase.storage.from('reviewers').remove([storagePath]);
  if (removal.error) {
    const message = (removal.error as { message?: string }).message ?? '';
    // Idempotent: a missing object is not a failure (a prior delete may have
    // already removed it). Any other storage error aborts before the row.
    if (!/not.?found/i.test(message)) {
      return { ok: false, error: classify(removal.error as { message?: string }) };
    }
  }

  const { error } = await supabase.from('reviewers').delete().eq('id', id);
  return error ? { ok: false, error: classify(error) } : { ok: true };
}

// ============ signed URLs (private buckets; mint on demand per click) ============

export type SignedUrlError = 'not-configured' | 'denied' | 'network';

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: SignedUrlError };

/** User-facing copy for a signed-URL failure (per-row inline). */
export const SIGNED_URL_MESSAGES: Record<SignedUrlError, string> = {
  'not-configured': "Couldn't open the file, try again",
  denied: "You don't have access to this file",
  network: "Couldn't open the file, try again",
};

/**
 * signedUrlFor — mint a short-lived signed URL for a private storage object on
 * demand (design OD-5). Minting is governed by the storage SELECT policy, so a
 * guessed/forbidden path yields a classified error, never a file; the path or a
 * partial URL is never surfaced. Pass `{ download: file_name }` to force a save
 * with the row's filename (the only reliable cross-origin mechanism, via the
 * Storage Content-Disposition); omit it for an inline preview in a new tab.
 */
export async function signedUrlFor(
  bucket: string,
  path: string,
  opts?: { download?: string | boolean },
): Promise<SignedUrlResult> {
  if (!supabase) return { ok: false, error: 'not-configured' };
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, opts);
  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: classify((error as { message?: string } | null) ?? null),
    };
  }
  return { ok: true, url: data.signedUrl };
}
