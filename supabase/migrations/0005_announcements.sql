-- =====================================================================
-- Class To-Do Board — announcements board (0005)
-- Adds a single public-read, officer-write announcements table so officers
-- can post latest/relevant notices that EVERYONE (including anonymous
-- visitors) can read. Only officers may post, and only officers may delete.
-- There is deliberately NO update path (mirrors reviewers rv_* no-update).
--
-- Append-only forward migration: 0001..0004 are ALREADY APPLIED and are NOT
-- modified. Reuses public.is_officer() (SECURITY DEFINER) for officer gating;
-- it is NEVER redefined here.
--
-- Section order mirrors 0003: table -> enable RLS -> table GRANTs (privileges
-- gate access FIRST) -> named role-explicit policies -> publication.
-- NOT seeded: no announcements are inserted by this migration.
-- =====================================================================

-- ============ table ============

-- announcements: officer-managed notices. Read mirrors events (public read);
-- write mirrors events officer-only; there is deliberately no `pinned` column
-- — created_at desc already satisfies "latest" (kept simple). created_by is
-- nullable + on delete set null so removing an author never erases the notice
-- (same stance as events.created_by).
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ============ enable RLS ============
alter table public.announcements enable row level security;

-- ============ table-level privileges ============
-- As in 0001/0003: privileges gate access FIRST, policies narrow it.
-- Public read (anon + authenticated); writes are authenticated-only and
-- further gated to officers by the policies below. NO update grant — editing
-- an announcement is out of scope (mirrors reviewers).
grant select on public.announcements to anon, authenticated;
grant insert, delete on public.announcements to authenticated;

-- ============ announcements policies ============
-- Public read; officer-only insert/delete — the events read/write pattern,
-- but split into explicit insert/delete (no `for all`) with NO update policy
-- so the no-update stance mirrors reviewers rv_*.
create policy announcements_read on public.announcements for select to anon, authenticated
  using (true);
create policy announcements_insert on public.announcements for insert to authenticated
  with check (public.is_officer());
create policy announcements_delete on public.announcements for delete to authenticated
  using (public.is_officer());

-- ============ Realtime publication (OD-4) ============
-- Published so a new announcement appears on other clients without a refetch,
-- like events/reviewers. The SELECT policy is row-independent (using(true)),
-- so the PK carried under the DEFAULT replica identity is sufficient to
-- reconcile a DELETE — no `replica identity full` needed (echoing the
-- 0001/0003 replica-identity contract: full is only for row-dependent policies
-- like task_completions.user_id = auth.uid()).
alter publication supabase_realtime add table public.announcements;
