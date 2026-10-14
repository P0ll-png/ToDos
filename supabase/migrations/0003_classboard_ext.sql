-- =====================================================================
-- Class To-Do Board — extension schema + Row-Level Security (0003)
-- Adds: events, personal task tracker, absences (with private
-- attachments) and reviewers (shared study files).
-- Extends 0001_init.sql; 0001 and 0002 are NOT modified.
-- Reuses public.is_officer() (SECURITY DEFINER) everywhere officer gating
-- is needed; it is never redefined here.
-- Section order mirrors 0001: enums -> tables -> enable RLS -> table
-- GRANTs (privileges gate access FIRST) -> named role-explicit policies
-- -> storage.objects policies -> publication / replica identity.
-- NOT seeded: no events or reviewers are inserted by this migration.
-- =====================================================================

-- ============ enums ============
create type public.event_type     as enum ('school_event', 'quiz', 'exam', 'presentation');
create type public.absence_reason as enum ('illness', 'family_emergency', 'school_related_activity', 'other');
create type public.absence_status as enum ('pending', 'acknowledged', 'needs_followup');

-- ============ tables ============

-- events: officer-managed calendar entities (mirrors tasks for read/write).
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  type       public.event_type not null,
  subject_id uuid references public.subjects(id) on delete set null,  -- nullable (OD-3): a school_event may have no subject; deleting a subject must not erase the event
  event_date date not null,
  start_time time,
  end_time   time,
  location   text not null default '',
  notes      text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  -- Time pairing: either no times at all, or a start is present (an end is
  -- optional, and when present must be >= start). This FORBIDS a bare end with
  -- a null start, which the form never produces (start/end are a pair) and
  -- which the looser `end is null or start is null or end >= start` form would
  -- have silently allowed. Boundary: start-only is valid; start == end is valid.
  constraint events_time_order check (
    (start_time is null and end_time is null)
    or (start_time is not null and (end_time is null or end_time >= start_time)))
);

-- task_completions: per-account "done for me" marks. Does NOT touch the
-- class-wide tasks.status (that stays officer-controlled). Composite PK is the
-- identity — there is deliberately no id column. Both FKs cascade.
create table public.task_completions (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  task_id      uuid not null references public.tasks(id)    on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

-- absence_requests: excuse submissions. subject_ids is an inline uuid[] (OD-2),
-- not a join table, so the single owner-or-officer privacy policy governs the
-- whole record atomically.
create table public.absence_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  date_from       date not null,
  date_to         date not null,
  subject_ids     uuid[] not null default '{}',
  all_classes     boolean not null default false,
  reason_category public.absence_reason not null,
  explanation     text not null default '',
  status          public.absence_status not null default 'pending',
  officer_remark  text,
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz default now(),
  constraint absence_date_range check (date_to >= date_from),
  constraint absence_explanation_len check (char_length(explanation) <= 500),
  -- Must name a scope: either all_classes, or at least one subject. Uses
  -- cardinality (returns 0 for '{}'), NOT array_length (returns NULL for '{}',
  -- which a CHECK passes on alongside TRUE, silently accepting an unscoped
  -- request with all_classes = false and an empty array).
  constraint absence_scope check (all_classes or cardinality(subject_ids) >= 1)
);

-- absence_attachments: files for a request. Access is always derived from the
-- parent request (see aa_* policies). size_bytes is client-reported metadata;
-- the authoritative byte cap is the bucket file_size_limit.
create table public.absence_attachments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.absence_requests(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  constraint attach_mime check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  -- NIT4 lockstep: keep this 5 MB cap in sync with the excuse-attachments
  -- bucket file_size_limit documented in SETUP.md. The bucket limit is the
  -- authoritative byte cap; this CHECK guards the recorded size_bytes metadata.
  constraint attach_size check (size_bytes > 0 and size_bytes <= 5 * 1024 * 1024)
);

-- reviewers: shared study files. Any signed-in user may read; uploader (or an
-- officer) may delete. No update path.
create table public.reviewers (
  id           uuid primary key default gen_random_uuid(),
  uploader_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  title        text not null,
  description  text,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  created_at   timestamptz default now(),
  -- NIT4 lockstep: keep this 20 MB cap in sync with the reviewers bucket
  -- file_size_limit documented in SETUP.md. The bucket limit is authoritative;
  -- this CHECK guards the recorded size_bytes metadata.
  constraint reviewer_size check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  -- Defense in depth alongside the bucket's allowed-MIME list.
  constraint reviewer_mime check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png'))
);

-- ============ enable RLS ============
alter table public.events              enable row level security;
alter table public.task_completions    enable row level security;
alter table public.absence_requests    enable row level security;
alter table public.absence_attachments enable row level security;
alter table public.reviewers           enable row level security;

-- ============ table-level privileges ============
-- As in 0001: privileges gate access FIRST, policies narrow it. The deliberate
-- omissions below (no anon grant on task_completions, the absence tables, or
-- reviewers) are defense in depth beneath the policies.

-- events: public read, officer-only writes (mirrors tasks).
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

-- task_completions: authenticated-only; NO anon grant at all.
grant select, insert, delete on public.task_completions to authenticated;

-- absences: authenticated-only read/write; NO anon grant (privacy).
grant select, insert, update, delete on public.absence_requests to authenticated;
grant select, insert, update, delete on public.absence_attachments to authenticated;

-- reviewers: authenticated read + write; NO anon grant.
grant select on public.reviewers to authenticated;
grant insert, delete on public.reviewers to authenticated;

-- ============ events policies ============
-- Public read; officer-only writes — the exact tasks pattern from 0001.
create policy events_read  on public.events for select to anon, authenticated using (true);
create policy events_write on public.events for all    to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- ============ task_completions policies ============
-- Own rows only. Completion is a toggle expressed as insert/delete — there is
-- deliberately no UPDATE policy or grant.
create policy tc_select on public.task_completions for select to authenticated
  using (user_id = auth.uid());
create policy tc_insert on public.task_completions for insert to authenticated
  with check (user_id = auth.uid());
create policy tc_delete on public.task_completions for delete to authenticated
  using (user_id = auth.uid());

-- ============ absence_requests policies ============
-- Read: owner OR officer. NEVER using(true); anon has no grant anyway.
create policy ar_select on public.absence_requests for select to authenticated
  using (user_id = auth.uid() or public.is_officer());

-- Insert: only as yourself, only in pending status.
create policy ar_insert on public.absence_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- Member update: own row AND only while still pending. The USING gates which
-- existing rows are updatable (must currently be yours and pending); the WITH
-- CHECK forbids a member from flipping status/officer fields.
create policy ar_update_member on public.absence_requests for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending'
              and officer_remark is null and reviewed_by is null);

-- Officer update: may set status/remark/review fields on any row.
create policy ar_update_officer on public.absence_requests for update to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- Member delete: own row only while pending.
create policy ar_delete_member on public.absence_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- ============ absence_attachments policies ============
-- Access is always derived from the parent request's ownership, so the privacy
-- rule has a single source of truth. is_officer() is SECURITY DEFINER and
-- bypasses RLS internally, so the subquery does not recurse (same argument as
-- 0001's profiles policies).
create policy aa_select on public.absence_attachments for select to authenticated
  using (exists (select 1 from public.absence_requests r
                 where r.id = request_id
                   and (r.user_id = auth.uid() or public.is_officer())));
create policy aa_insert on public.absence_attachments for insert to authenticated
  with check (exists (select 1 from public.absence_requests r
                      where r.id = request_id and r.user_id = auth.uid()
                        and r.status = 'pending'));
create policy aa_delete on public.absence_attachments for delete to authenticated
  using (exists (select 1 from public.absence_requests r
                 where r.id = request_id and r.user_id = auth.uid()
                   and r.status = 'pending'));

-- ============ reviewers policies ============
-- Authenticated read-all, own-insert, owner-or-officer delete. No UPDATE
-- policy (upload + delete only; editing is out of scope).
create policy rv_select on public.reviewers for select to authenticated using (true);
create policy rv_insert on public.reviewers for insert to authenticated
  with check (uploader_id = auth.uid());
create policy rv_delete on public.reviewers for delete to authenticated
  using (uploader_id = auth.uid() or public.is_officer());

-- ============ storage.objects policies (OD-6) ============
-- These are ordinary policies on a table in the storage schema. Bucket rows and
-- their allowed-MIME / file_size_limit config are a manual SETUP.md step.
-- Folder ownership is enforced with (storage.foldername(name))[1] = auth.uid()::text
-- (the first path segment is the {user_id} folder). No anon policy on either
-- bucket -> anon cannot mint a signed URL.

-- excuse-attachments: path layout {user_id}/{request_id}/filename.
-- INSERT mirrors aa_insert exactly: the object must land in the caller's own
-- {user_id}/ folder (segment [1]) AND segment [2] ({request_id}) must name a
-- request the caller OWNS and that is still PENDING. The absence_requests row
-- MUST be inserted before any attachment object is uploaded.
create policy ea_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'excuse-attachments'
              and (storage.foldername(name))[1] = auth.uid()::text
              and exists (
                select 1 from public.absence_requests r
                where r.id::text = (storage.foldername(name))[2]
                  and r.user_id = auth.uid()
                  and r.status = 'pending'));
create policy ea_select_own on storage.objects for select to authenticated
  using (bucket_id = 'excuse-attachments'
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy ea_select_officer on storage.objects for select to authenticated
  using (bucket_id = 'excuse-attachments' and public.is_officer());
-- Mirror the table-level pending-only rule (aa_delete) so a member cannot delete
-- the certificate file after an officer has acknowledged the request. Segment
-- [2] is the request id.
create policy ea_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'excuse-attachments'
         and (storage.foldername(name))[1] = auth.uid()::text
         and exists (
           select 1 from public.absence_requests r
           where r.id::text = (storage.foldername(name))[2]
             and r.user_id = auth.uid()
             and r.status = 'pending'));

-- reviewers: path layout {uploader_id}/{reviewer_id}/filename.
create policy rv_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reviewers'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy rv_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'reviewers');          -- any signed-in user may read/download
create policy rv_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reviewers'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_officer()));

-- ============ Realtime publication + replica identity (OD-4) ============
-- events (public read), task_completions (cross-device persistence) and
-- reviewers (live new-upload) are published. The absence tables are
-- intentionally NOT published — their review workflow refetches on demand and
-- publishing a row-dependent, medical-adjacent table would widen the blast
-- radius.
alter publication supabase_realtime add table public.events, public.task_completions, public.reviewers;

-- task_completions has a row-dependent SELECT policy (user_id = auth.uid()), so
-- per the replica-identity contract in 0001 and SETUP.md we set replica
-- identity full. (user_id is part of the composite PK and so technically present
-- under the default identity, but we follow the documented rule literally rather
-- than relying on that coincidence.)
alter table public.task_completions replica identity full;
-- absence_requests / absence_attachments are intentionally NOT published.
