# Requirements — Class To-Do Board Extension (classboard-ext)

## Summary

Extend the existing "Class To-Do Board" app (React 18.3.1 + TS 5.5.4 + Vite 5.4.3 + `@supabase/supabase-js` 2.45.4; Vitest) with five capability groups: a top navigation across three pages (Board, Absences, Reviewers), officer-managed **events**, a per-account **personal task tracker**, a **month calendar** view on the Board, an **absences** (excuse submission) workflow with private attachments, and a **reviewers** (shared study files) page.

All schema changes MUST go into a single NEW migration `supabase/migrations/0003_<name>.sql`. The existing migrations `0001_init.sql` and `0002_deadline_timestamptz.sql` MUST NOT be modified.

The extension MUST preserve the established conventions observed in the codebase:

- RLS enabled on every table, with explicit table-level `GRANT`s to `anon` / `authenticated` and policies that name the roles explicitly (per `0001_init.sql`).
- The `is_officer()` SECURITY DEFINER helper for officer gating (reused, never re-implemented client-side).
- Authorization is server-side only: UI hiding of controls is convenience, not a security boundary; write wrappers trust RLS (per `src/data/mutations.ts`).
- Anonymous visitors keep full read-only access to public data; the session is never a read gate for public tables (per `src/context/SessionProvider.tsx`, `src/data/useRealtimeTable.ts`).
- All colors come from theme tokens (CSS variables in `src/styles/tokens.css`); no hardcoded colors. Full light/dark support at WCAG AA contrast.
- Derived state (e.g. glow) stays derived via pure functions in `src/lib/` (per `src/lib/derive.ts`), never stored.

Assumptions (flagged for the design step to confirm): no client router is currently installed, so the navigation approach is an open design decision; several storage/data-shape choices are deferred to design (see "Open Design Decisions").

## Functional Requirements

### 0. Navigation

- FR-0.1 A top navigation exposes three pages: **Board** (the current page, publicly readable), **Absences** (requires sign-in), and **Reviewers** (requires sign-in).
- FR-0.2 The navigation integrates the existing `Header` elements (user name, Appearance/theme button via `AppearancePanel`, sign-out button, sign-in via `AuthDialog`, officer-only Members via `AdminPanel`) without duplicating them.
- FR-0.3 Absences and Reviewers are gated to signed-in users: a signed-out visitor who reaches them sees a sign-in prompt / blocked state rather than data.
- FR-0.4 Officers see a badge in the navigation showing the count of absence requests with status `pending`.
- FR-0.5 Navigation is keyboard accessible and themed with tokens; the current page is indicated non-visually (e.g. `aria-current`) as well as visually.

### 1. Events (officer-only add)

- FR-1.1 An "Add Event" control, separate from "Add Task", is visible to officers only (UI convenience; the DB enforces the real boundary).
- FR-1.2 Event types are a Postgres enum: `school_event`, `quiz`, `exam`, `presentation`.
- FR-1.3 The Add Event form captures: type (required), title (required), subject (optional — `school_event` may have none), event date (required), start time (optional), end time (optional), location, and notes.
- FR-1.4 A new table `events` is created in `0003` with columns: `id`, `title`, `type` (enum), `subject_id` (nullable FK to `subjects`), `event_date` (date), `start_time` (time, nullable), `end_time` (time, nullable), `location` (text), `notes` (text), `created_by` (FK to `profiles`), `created_at`.
- FR-1.5 RLS on `events`: `anon` + `authenticated` may read; only officers may insert, update, and delete — the same pattern as `tasks` (`using (public.is_officer()) with check (public.is_officer())`).
- FR-1.6 `events` is added to the `supabase_realtime` publication so officer changes reconcile live on every client.
- FR-1.7 Events appear in the right-hand list alongside tasks, each with a type badge.
- FR-1.8 Each event type has a distinct color token AND an icon, so type is conveyed by more than color alone.
- FR-1.9 A subject with an upcoming `quiz`, `exam`, or `presentation` within 7 days gets a small badge on its schedule cell, visually and semantically distinct from the existing pending-work glow/dot.
- FR-1.10 The "upcoming event within 7 days" determination is a pure function in `src/lib/`, unit-tested, and derived from the live events array (not stored).

### 2. Personal tracker (per account)

- FR-2.1 Every signed-in user can mark any task done or not-done for themselves only.
- FR-2.2 Marking a task done/not-done MUST NOT change the class-wide `tasks.status`, which remains officer-controlled.
- FR-2.3 A new table `task_completions` is created with columns `user_id`, `task_id`, `completed_at`, and primary key `(user_id, task_id)`.
- FR-2.4 Rows cascade-delete when either the referenced task or the referenced user is removed.
- FR-2.5 RLS on `task_completions`: a user may `select`, `insert`, and `delete` ONLY their own rows (`user_id = auth.uid()`). Grants for select/insert/delete go to `authenticated` only; `anon` has no access.
- FR-2.6 UI: a checkbox on each task row. Completed rows are dimmed and struck-through using tokens, with the completion state also conveyed by the checkbox state and screen-reader text (never color alone).
- FR-2.7 The task list has a filter: **All / My unfinished / My finished**.
- FR-2.8 Completion toggles use optimistic updates and the state persists across devices (server-backed).
- FR-2.9 The subject glow is viewer-dependent and derived (not stored): for a signed-in user a subject glows iff they have at least one **unfinished pending** task for that subject; for a signed-out visitor it glows iff any task for that subject is pending (the current behavior).
- FR-2.10 The glow derivation in `src/lib/derive.ts` is updated to be parameterized by viewer state and completion set, with accompanying unit tests.

### 3. Month calendar

- FR-3.1 The Board page gains a toggle above the left column: **"Weekly schedule | Month calendar"**. The details panel and the right-hand list are unchanged.
- FR-3.2 The month grid shows tasks (on their deadline date) and events (on their event date) as small chips, each with color and icon by type.
- FR-3.3 A day cell with more than 3 items shows the first items plus a "+N more" indicator.
- FR-3.4 The calendar provides previous-month, next-month, and "Today" controls; today's cell is highlighted.
- FR-3.5 Clicking (or activating) a day opens that day's items in the details panel area.
- FR-3.6 For a signed-in user, their finished tasks appear dimmed on the calendar.
- FR-3.7 Weeks start on Monday and the grid includes Saturday (class days span Mon..Sat, matching `schedule_slots.day` 1..6).
- FR-3.8 Month-grid construction is a pure, unit-tested function in `src/lib/` covering leading/trailing days of adjacent months, today detection, bucketing items into days, and the "+N more" cutoff.
- FR-3.9 The calendar is fully keyboard accessible: day cells are focusable, Enter/Space activate them, and a visible focus ring (`--focus-ring`) is shown.
- FR-3.10 The calendar is themed with tokens and responsive; on mobile it shows dots per day and lists the tapped day's items below.

### 4. Absences (excuse submissions)

- FR-4.1 Any signed-in user can file an absence request via a short form.
- FR-4.2 The form captures: a start date (`date_from`) and end date (`date_to`); subjects affected (a multi-select of subjects **plus** an "All classes" option); a reason category (enum `illness`, `family_emergency`, `school_related_activity`, `other`); a short explanation (max 500 characters); and up to 3 file attachments.
- FR-4.3 Attachments are limited to PDF/JPG/PNG, each ≤ 5 MB; the upload UI shows progress and validates type and size client-side.
- FR-4.4 A new table `absence_requests` is created with columns: `id`, `user_id` (FK to `profiles`), `date_from`, `date_to`, `all_classes` (boolean), `reason_category` (enum), `explanation`, `status` (enum `pending` | `acknowledged` | `needs_followup`, default `pending`), `officer_remark` (nullable), `reviewed_by` (FK, nullable), `reviewed_at` (nullable), `created_at`.
- FR-4.5 A DB CHECK constraint enforces `date_to >= date_from`; a DB CHECK (or equivalent) enforces `explanation` length ≤ 500 characters; the reason category and status are enum-constrained.
- FR-4.6 A new table `absence_attachments` is created with columns: `id`, `request_id` (FK to `absence_requests`, `on delete cascade`), `storage_path`, `file_name`, `mime_type`, `size_bytes`.
- FR-4.7 Member view: a "My requests" list showing each request with a status badge (conveyed by text/icon, not color alone) and any officer remark.
- FR-4.8 Officer view: an inbox of ALL requests with filters by status, date range, subject, and student name; the ability to open attachments, set the status, and add a remark.
- FR-4.9 The navigation shows the officer pending-count badge (see FR-0.4) sourced from this data.
- FR-4.10 The form shows the notice: "Attachments are visible only to you and class officers."
- FR-4.11 Members cannot edit a request once an officer has acknowledged it (i.e. once `status != 'pending'`); members can delete a request only while it is `pending`. These rules are enforced by RLS `USING` / `WITH CHECK`, not UI alone.
- FR-4.12 The Absences page provides loading, empty, and error states.

#### Privacy requirements (CRITICAL — medical certificates are sensitive personal data)

- FR-4.P1 A member may read ONLY their own `absence_requests` and `absence_attachments`; officers may read all; `anon` may read none. The read policies are row-dependent (`user_id = auth.uid()` OR `public.is_officer()`) — NOT `using(true)`.
- FR-4.P2 Attachment files are stored in a PRIVATE Supabase Storage bucket named `excuse-attachments`, under the path `{user_id}/{request_id}/filename`.
- FR-4.P3 Files are served only through short-lived signed URLs; there are no public object URLs.
- FR-4.P4 `storage.objects` policies restrict upload and read to a user's own `{user_id}/` folder; officers may read all; `anon` has no access.
- FR-4.P5 File type and size are validated in the storage layer too (bucket allowed MIME types / size limit), not only client-side.
- FR-4.P6 A member must not be able to read another member's absence request or attachment via the UI, the API, or a guessed storage URL; officers must be able to read all.

### 5. Reviewers (shared study files)

- FR-5.1 Any signed-in user can upload a reviewer with: a title (required), a subject (required, FK to `subjects`), an optional description, and exactly one file.
- FR-5.2 The file must be PDF/DOCX/PPTX/JPG/PNG and ≤ 20 MB; type and size are validated client-side and in the storage policy.
- FR-5.3 A new table `reviewers` is created with columns: `id`, `uploader_id` (FK to `profiles`), `subject_id` (required FK to `subjects`), `title`, `description` (nullable), `storage_path`, `file_name`, `mime_type`, `size_bytes`, `created_at`.
- FR-5.4 A Storage bucket `reviewers` is created where only authenticated users may read/download (no `anon`); users may upload only into their own `{user_id}/` folder.
- FR-5.5 Delete rules: an uploader may delete their own reviewer; officers may delete any reviewer (moderation). These rules are enforced in both the `reviewers` table RLS and the `storage.objects` policies.
- FR-5.6 UI: a card grid showing title, subject, uploader name, upload date, file-type icon, file size, and a download button.
- FR-5.7 The grid supports filtering by subject, searching by title, and sorting by newest.
- FR-5.8 The page provides an empty state and uses the shared `Modal` for a confirm dialog before any delete.

## Non-Functional Requirements

- NFR-1 All new UI uses theme tokens exclusively and works in both light and dark mode at WCAG AA contrast. Any new color token added is covered by the existing AA/contrast harness (`src/lib/palette-aa.test.ts` style).
- NFR-2 Every new table has RLS enabled, explicit `GRANT`s to the correct roles, and policies written for `anon`, `member`, and `officer`.
- NFR-3 Database constraints enforce all new enums and the absence date range (`date_to >= date_from`).
- NFR-4 Every new page provides loading, empty, and error states.
- NFR-5 All derived cross-cutting logic (upcoming-event badge, viewer-dependent glow, month-grid construction) lives as pure functions in `src/lib/` with unit tests, consistent with `src/lib/derive.ts`.
- NFR-6 RLS behavior for every new table is covered by integration tests in the style of `src/__tests__/rls.integration.test.ts`, exercising `anon`, `member`, and `officer`.
- NFR-7 README/SETUP docs are updated to describe creating the two new storage buckets and applying `0003`. No events or reviewers are seeded.
- NFR-8 Keyboard accessibility and visible focus rings apply to all new interactive elements (navigation, calendar cells, forms, dialogs), consistent with the existing focus-ring convention.

## Acceptance Criteria

1. A `member` cannot create, edit, or delete an `event`, even by calling the Supabase API directly (RLS denies insert/update/delete); `anon` likewise cannot.
2. An `officer` can create, edit, and delete events, and both anonymous and signed-in clients receive the change in real time (the calendar and right-hand list update without a manual refresh).
3. Marking a task done/not-done changes only the acting user's own view; `tasks.status` is unchanged and no other user's view is affected.
4. For a signed-in user, a subject glows iff they have ≥ 1 unfinished pending task for it; for a signed-out visitor it glows iff any task for it is pending.
5. The month calendar shows the correct tasks (by deadline date) and events (by event date) for each displayed month, a day with > 3 items shows "+N more", today is highlighted, and a signed-in user's finished tasks appear dimmed.
6. The month grid, upcoming-event-badge, and glow functions pass unit tests covering boundary cases (month edges, exactly-7-days, exactly-3-vs-4 items, viewer signed-in vs signed-out).
7. A `member` filing an absence request can read it back; a different `member` cannot read that request or its attachments via the UI, the API, or a guessed storage URL; an `officer` can read both.
8. An attachment file that is the wrong type or over the size limit is rejected both by client-side validation and by the storage policy.
9. A member cannot edit an absence request once its status is not `pending`, and cannot delete it unless it is `pending` (enforced by RLS).
10. The officer navigation badge shows the correct count of `pending` absence requests.
11. Any signed-in user can upload a reviewer, and every signed-in user can download it; an `anon` user cannot download it.
12. A non-uploader cannot delete another user's reviewer, except an officer (who can delete any).
13. The RLS integration suite passes for `anon`, `member`, and `officer` across all new tables.
14. All new UI renders correctly in light and dark mode, and new tokens pass the AA contrast assertions.

## Out of Scope

- Modifying `0001_init.sql` or `0002_deadline_timestamptz.sql` (all schema changes go in `0003`).
- Seeding events or reviewers data.
- Email/push notifications for absence status changes.
- Officer-side editing of absence attachments or re-upload on a member's behalf.
- Versioning or revision history for reviewers.
- Changing the existing officer-controlled `tasks.status` semantics.

## Open Design Decisions (for the design step to resolve)

- OD-1 **Navigation approach**: no client router is currently installed. Decide whether to add a router (e.g. `react-router`) or implement lightweight state-based page switching, and how deep-linking / sign-in gating for Absences and Reviewers is handled.
- OD-2 **Absence subjects-affected storage**: a `subject_ids uuid[]` column on `absence_requests` versus a dedicated join table (plus how "All classes" is represented alongside it).
- OD-3 **Realtime for the private absence tables**: whether `absence_requests` / `absence_attachments` are added to the Realtime publication (and if so, whether `REPLICA IDENTITY FULL` is required because their SELECT policies are row-dependent, per the note in `0001_init.sql`), or whether these pages refetch on demand instead.
- OD-4 **Signed-URL flow**: how and where short-lived signed URLs are minted for excuse attachments and reviewer downloads (expiry duration, on-demand per click vs batched), and the download UX for `reviewers`.
- OD-5 **Bucket creation mechanism**: which storage bucket and `storage.objects` policy steps can be expressed as SQL inside `0003` versus which must be performed manually in the Supabase dashboard, and how that is documented in SETUP.md.
- OD-6 **Event ↔ calendar/list color tokens**: the specific new token names for the four event types (and the schedule-cell upcoming-event badge), and how they are added to the AA/contrast harness.
