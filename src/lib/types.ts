/**
 * types.ts — database row types and domain types.
 *
 * DATE CONTRACT: given_date and deadline are Postgres `date`, returned by
 * Supabase as 'YYYY-MM-DD' strings. They are typed `string | null` and MUST
 * NEVER be coerced through `new Date()` — all comparison is lexicographic on
 * the zero-padded strings (see derive.ts / sorting.ts).
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
  given_date: string;
  deadline: string | null;
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

export type { ThemePrefs };
