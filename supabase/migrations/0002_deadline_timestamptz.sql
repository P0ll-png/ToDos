-- ============================================================================
-- 0002_deadline_timestamptz.sql
--
-- Change tasks.deadline from `date` to `timestamptz` so a task can carry a
-- submission TIME, not just a day. given_date stays `date` (date-only).
--
-- Existing `date` values are midnight of that day; casting a date to
-- timestamptz interprets it at 00:00 in the server session timezone. That is
-- the correct, lossless promotion for already-stored day-only deadlines.
--
-- Overdue is now "deadline < now()" (a moment), evaluated client-side against
-- the ISO timestamp the API returns. RLS, grants, and the Realtime publication
-- are unaffected by a column type change.
--
-- Run this ONCE on a database that already has 0001 applied. On a fresh
-- database 0001 already creates the column as timestamptz, so this migration is
-- a harmless no-op there (the ALTER to the same type succeeds without change).
-- ============================================================================

alter table public.tasks
  alter column deadline type timestamptz
  using deadline::timestamptz;
