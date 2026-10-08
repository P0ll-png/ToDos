-- =====================================================================
-- Class To-Do Board — initial schema + Row-Level Security
-- Authoritative migration. Apply with the Supabase SQL editor or CLI.
-- NOT seeded: officers populate subjects/schedule_slots/tasks themselves.
-- =====================================================================

-- ============ enums ============
create type public.user_role  as enum ('officer', 'member');
create type public.task_status as enum ('pending', 'done');

-- ============ tables ============
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  name              text not null default '',
  email             text not null,
  role              public.user_role not null default 'member',
  theme_preferences jsonb not null default '{}'::jsonb,
  created_at        timestamptz default now()
);

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  room       text not null default '',
  color      text,                       -- nullable
  created_at timestamptz default now()
);

create table public.schedule_slots (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  day        smallint not null check (day between 1 and 6),  -- 1=Mon .. 6=Sat
  start_time time not null,
  end_time   time not null
);

create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title      text not null,
  notes      text not null default '',
  given_date date not null default current_date,
  deadline   date,                                           -- nullable
  created_by uuid references public.profiles(id) on delete set null,
  status     public.task_status not null default 'pending',
  created_at timestamptz default now()
);

-- ============ officer check (SECURITY DEFINER to avoid RLS recursion) ============
-- is_officer() reads profiles. The profiles role-change policy below uses is_officer().
-- If this ran as SECURITY INVOKER, evaluating that policy would call is_officer(),
-- which queries profiles, which re-evaluates the policy -> 42P17 infinite recursion.
-- SECURITY DEFINER makes the internal SELECT bypass RLS, breaking the cycle.
-- search_path is pinned to prevent definer-privilege hijacking via a shadowed table.
create or replace function public.is_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'officer'
  );
$$;

-- current_role_of(uid): returns the COMMITTED stored role for a user.
-- Finding #1: the independent re-read inside this SECURITY DEFINER function,
-- evaluated under Postgres' default READ COMMITTED isolation, is the SOLE
-- mechanism that makes profiles_update_self read the OLD (pre-UPDATE) role:
-- the function's SELECT runs against the statement's MVCC snapshot and sees the
-- committed row, NOT the in-flight new tuple from the same UPDATE. The STABLE
-- marker is ONLY a planner hint (no writes, may be folded per-scan); it does
-- NOT define snapshot visibility. search_path is pinned; being SECURITY DEFINER
-- its SELECT bypasses RLS so Policy A does not silently depend on profiles_read.
create or replace function public.current_role_of(uid uuid)
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = uid;
$$;

-- ============ new-user trigger: create a profiles row on signup ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ enable RLS ============
alter table public.profiles       enable row level security;
alter table public.subjects       enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.tasks          enable row level security;

-- ============ table-level privileges ============
-- RLS filters rows, but table privileges gate access FIRST. Anonymous SELECT
-- needs BOTH a GRANT SELECT TO anon AND a permissive SELECT policy naming anon.
-- Writes are granted only to authenticated; anon has no write privilege at all,
-- and the officer check in the policies narrows authenticated writes to officers.
grant select on public.profiles, public.subjects, public.schedule_slots, public.tasks
  to anon, authenticated;
grant insert, update, delete on public.subjects, public.schedule_slots, public.tasks
  to authenticated;

-- Finding #3: COLUMN-SCOPED officer writes on profiles. We do NOT grant a broad
-- `update` on profiles. Officers may change ONLY the `role` column (promote /
-- demote), authorized by profiles_update_officer below. The `name` and
-- `theme_preferences` columns are written exclusively through profiles_update_self
-- (Policy A); that path works because Postgres' default replica/update column
-- privilege for a SECURITY INVOKER policy still requires a column grant, so we
-- also grant the self-editable columns to authenticated.
grant update (role) on public.profiles to authenticated;
grant update (name, theme_preferences) on public.profiles to authenticated;

-- (No write grants to anon. No service-role usage in the client.)

-- ============ profiles policies ============
-- Public read (names/roles visible; see Security Notes in design.md for the
-- email implication).
create policy profiles_read
  on public.profiles for select
  to anon, authenticated
  using (true);

-- Finding #2: NO INSERT policy on profiles BY DESIGN — rows are created only by
-- the SECURITY DEFINER handle_new_user() trigger, whose owner bypasses RLS.
-- Do NOT add FORCE ROW LEVEL SECURITY without first adding an INSERT policy, or
-- signup breaks (the trigger insert would be blocked). FORCE RLS is intentionally
-- NOT enabled here.

-- Policy A: a user may update their OWN profile, but may NOT change their own role.
-- The WITH CHECK compares the NEW role against the committed stored role via the
-- SECURITY DEFINER helper current_role_of (snapshot-stable; reads the OLD role).
-- Scope: single-row self-updates only (id = auth.uid() matches at most one row).
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role_of(auth.uid()));

-- Policy B: an officer may update ANY profile's role (promote/demote). Combined
-- with the column grants above, officers effectively change only `role` here.
create policy profiles_update_officer
  on public.profiles for update
  to authenticated
  using (public.is_officer())
  with check (public.is_officer());

-- ============ subjects / schedule_slots / tasks policies ============
-- Public read for everyone (anon + authenticated).
create policy subjects_read on public.subjects       for select to anon, authenticated using (true);
create policy slots_read    on public.schedule_slots for select to anon, authenticated using (true);
create policy tasks_read    on public.tasks          for select to anon, authenticated using (true);

-- Officer-only writes. FOR ALL applies USING to UPDATE/DELETE (existing rows)
-- and WITH CHECK to INSERT/UPDATE (new rows). An anon/member INSERT fails
-- WITH CHECK; an anon/member UPDATE/DELETE fails USING. Both clauses are
-- is_officer(). anon additionally has no write table privilege (defense in depth).
create policy subjects_write on public.subjects       for all to authenticated using (public.is_officer()) with check (public.is_officer());
create policy slots_write    on public.schedule_slots for all to authenticated using (public.is_officer()) with check (public.is_officer());
create policy tasks_write    on public.tasks          for all to authenticated using (public.is_officer()) with check (public.is_officer());

-- ============ Realtime publication ============
-- Publishes INSERT/UPDATE/DELETE for these tables. Clients reconcile strictly by
-- `id` taken from the `new` payload (UPDATE/INSERT) or the `old` payload (DELETE);
-- the PK is always present under the DEFAULT replica identity, so no
-- REPLICA IDENTITY FULL is needed for the current design. BEFORE adding any
-- row-dependent (non `using(true)`) SELECT policy to a published table, add
-- `alter table public.<t> replica identity full;` for that table — a row-dependent
-- policy may need `old`-row columns to authorize UPDATE/DELETE delivery, which the
-- default identity does not provide.
alter publication supabase_realtime add table public.subjects, public.schedule_slots, public.tasks;
