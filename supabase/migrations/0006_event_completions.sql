-- =====================================================================
-- Class To-Do Board — per-account event completions (0006)
-- Adds: event_completions, the "mark an event done FOR ME" tracker.
-- Mirrors public.task_completions in 0003 EXACTLY: composite PK (no id),
-- authenticated-only grants (NO anon grant), own-rows-only insert/delete
-- policies with NO update path, published to supabase_realtime with
-- `replica identity full`. Does NOT change class-wide event state.
-- Extends 0003_classboard_ext.sql; 0001..0005 are NOT modified.
-- Section order mirrors 0003: table -> enable RLS -> GRANTs (privileges
-- gate FIRST) -> named role-explicit policies -> publication / replica
-- identity.
-- =====================================================================

-- ============ tables ============

-- event_completions: per-account "done for me" marks on events. Does NOT touch
-- any class-wide event state (events have none — completion is purely personal,
-- exactly like task_completions is to tasks.status). Composite PK is the
-- identity — there is deliberately no id column. Both FKs cascade.
create table public.event_completions (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  event_id     uuid not null references public.events(id)   on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ============ enable RLS ============
alter table public.event_completions enable row level security;

-- ============ table-level privileges ============
-- As in 0003: privileges gate access FIRST, policies narrow it. NO anon grant
-- at all (defense in depth beneath the own-rows-only policies), exactly like
-- task_completions.
grant select, insert, delete on public.event_completions to authenticated;

-- ============ event_completions policies ============
-- Own rows only. Completion is a toggle expressed as insert/delete — there is
-- deliberately no UPDATE policy or grant (mirrors tc_*).
create policy ec_select on public.event_completions for select to authenticated
  using (user_id = auth.uid());
create policy ec_insert on public.event_completions for insert to authenticated
  with check (user_id = auth.uid());
create policy ec_delete on public.event_completions for delete to authenticated
  using (user_id = auth.uid());

-- ============ Realtime publication + replica identity ============
-- Published for cross-device persistence, like task_completions.
alter publication supabase_realtime add table public.event_completions;

-- event_completions has a row-dependent SELECT policy (user_id = auth.uid()), so
-- per the replica-identity contract in 0001/0003 and SETUP.md we set replica
-- identity full so a DELETE's `old` payload carries the composite key for the
-- client reconcile. (user_id is part of the composite PK and so technically
-- present under the default identity, but we follow the documented rule
-- literally rather than relying on that coincidence — same as task_completions.)
alter table public.event_completions replica identity full;
