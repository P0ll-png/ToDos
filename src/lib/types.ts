/**
 * types.ts — database row types and domain types.
 *
 * DATE CONTRACT:
 *  - given_date is a Postgres `date`, returned as a 'YYYY-MM-DD' string. It is
 *    date-only and compared lexicographically; never coerce it through `new
 *    Date()`.
 *  - deadline is a Postgres `timestamptz` (date + time of submission), returned
 *    as an ISO 8601 string (e.g. '2026-10-08T14:30:00+00:00') or null. Sorting
 *    still works lexicographically because all deadlines share the ISO format;
 *    overdue compares the parsed instant against now() (see derive.ts).
 */

import type { ThemePrefs } from './theme-core';

export type UserRole = 'officer' | 'member';
export type TaskStatus = 'pending' | 'done';

/** profiles row (snake_case as returned by Supabase). */
export interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  theme_preferences: unknown; // parsed defensively into ThemePrefs
  created_at: string | null;
}

/** subjects row. */
export interface SubjectRow {
  id: string;
  name: string;
  room: string;
  color: string | null;
  created_at: string | null;
}

/** schedule_slots row. day: 1=Mon .. 5=Fri. */
export interface ScheduleSlotRow {
  id: string;
  subject_id: string;
  day: number;
  start_time: string; // 'HH:MM:SS'
  end_time: string; // 'HH:MM:SS'
}

/** tasks row. given_date/deadline are 'YYYY-MM-DD' strings — never Date. */
export interface TaskRow {
  id: string;
  subject_id: string;
  title: string;
  notes: string;
  given_date: string; // 'YYYY-MM-DD'
  deadline: string | null; // ISO timestamptz string, or null
  created_by: string | null;
  status: TaskStatus;
  created_at: string | null;
}

/** Domain shape used by UI/derivation (camelCase). */
export interface Task {
  id: string;
  subjectId: string;
  title: string;
  notes: string;
  givenDate: string;
  deadline: string | null;
  createdBy: string | null;
  status: TaskStatus;
}

export interface Subject {
  id: string;
  name: string;
  room: string;
  color: string | null;
}

export interface ScheduleSlot {
  id: string;
  subjectId: string;
  day: number;
  startTime: string;
  endTime: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  themePreferences: ThemePrefs;
}

// ============ events (FEAT) ============

/** Event classification enum. */
export type EventType = 'school_event' | 'quiz' | 'exam' | 'presentation';

/**
 * events row.
 *
 * DATE CONTRACT: event_date is a Postgres `date`, returned as a date-only
 * 'YYYY-MM-DD' string — compared lexically, never through `new Date()`.
 * start_time/end_time are Postgres `time` values, returned as 'HH:MM:SS'
 * strings or null.
 */
export interface EventRow {
  id: string;
  title: string;
  type: EventType;
  subject_id: string | null;
  event_date: string; // 'YYYY-MM-DD'
  start_time: string | null; // 'HH:MM:SS' | null
  end_time: string | null; // 'HH:MM:SS' | null
  location: string;
  notes: string;
  created_by: string | null;
  created_at: string | null;
}

/** Domain shape for an event (camelCase). */
export interface EventItem {
  id: string;
  title: string;
  type: EventType;
  subjectId: string | null;
  eventDate: string; // 'YYYY-MM-DD'
  startTime: string | null; // 'HH:MM:SS' | null
  endTime: string | null; // 'HH:MM:SS' | null
  location: string;
  notes: string;
  createdBy: string | null;
}

// ============ personal tracker (FEAT) ============

/**
 * task_completions row. Composite primary key (user_id, task_id); no single id.
 * completed_at is an ISO timestamptz string.
 */
export interface TaskCompletionRow {
  user_id: string;
  task_id: string;
  completed_at: string | null;
}

/** Domain shape for a per-user task completion (camelCase). */
export interface TaskCompletion {
  userId: string;
  taskId: string;
  completedAt: string | null;
}

// ============ absences (FEAT) ============

/**
 * Reason category enum for an absence request. The literals MUST match the
 * Postgres `public.absence_reason` enum in 0003 exactly, since the value is
 * sent verbatim to the DB — in particular 'school_related_activity', not
 * 'school_activity'.
 */
export type AbsenceReason =
  | 'illness'
  | 'family_emergency'
  | 'school_related_activity'
  | 'other';

/** Officer-controlled status enum for an absence request. */
export type AbsenceStatus = 'pending' | 'acknowledged' | 'needs_followup';

/**
 * absence_requests row.
 *
 * DATE CONTRACT: date_from/date_to are Postgres `date` values, returned as
 * date-only 'YYYY-MM-DD' strings — compared lexically, never through
 * `new Date()`. subject_ids is a Postgres uuid[] of affected subject ids.
 * reviewed_at/created_at are ISO timestamptz strings.
 */
export interface AbsenceRequestRow {
  id: string;
  user_id: string;
  date_from: string; // 'YYYY-MM-DD'
  date_to: string; // 'YYYY-MM-DD'
  subject_ids: string[];
  all_classes: boolean;
  reason_category: AbsenceReason;
  explanation: string;
  status: AbsenceStatus;
  officer_remark: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

/** Domain shape for an absence request (camelCase). */
export interface AbsenceRequest {
  id: string;
  userId: string;
  dateFrom: string; // 'YYYY-MM-DD'
  dateTo: string; // 'YYYY-MM-DD'
  subjectIds: string[];
  allClasses: boolean;
  reasonCategory: AbsenceReason;
  explanation: string;
  status: AbsenceStatus;
  officerRemark: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Only populated by the officer inbox embed (student:profiles(name)). */
  studentName?: string;
}

/** absence_attachments row. */
export interface AbsenceAttachmentRow {
  id: string;
  request_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

/** Domain shape for an absence attachment (camelCase). */
export interface AbsenceAttachment {
  id: string;
  requestId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

// ============ reviewers (FEAT) ============

/** reviewers row. created_at is an ISO timestamptz string. */
export interface ReviewerRow {
  id: string;
  uploader_id: string;
  subject_id: string;
  title: string;
  description: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string | null;
}

/** Domain shape for a shared reviewer (camelCase). */
export interface Reviewer {
  id: string;
  uploaderId: string;
  subjectId: string;
  title: string;
  description: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string | null;
  /** Only populated by the card-grid embed (uploader:profiles(name)). */
  uploaderName?: string;
}

// ============ calendar (FEAT) ============

/**
 * A normalized calendar item — a task or an event — placed on a single day.
 *
 * DATE CONTRACT: datePart is a date-only 'YYYY-MM-DD' string (a task's deadline
 * date part, or an event's event_date). startTime is always null for a task so
 * date-only items sort before timed events on the same day.
 */
export interface CalendarItem {
  kind: 'task' | 'event';
  type: EventType | TaskStatus;
  title: string;
  id: string;
  datePart: string; // 'YYYY-MM-DD'
  startTime: string | null; // 'HH:MM:SS' | null
  /** For tasks only: whether the viewer has completed it (dimming). */
  done?: boolean;
}

/** One cell in the month grid. dateYMD is a date-only 'YYYY-MM-DD' string. */
export interface MonthCell {
  dateYMD: string; // 'YYYY-MM-DD'
  inMonth: boolean;
  isToday: boolean;
}

export type { ThemePrefs };
