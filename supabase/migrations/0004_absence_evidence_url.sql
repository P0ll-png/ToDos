-- =====================================================================
-- Class To-Do Board — absence evidence link (0004)
-- Replaces the absence FILE-ATTACHMENT subsystem with a single optional
-- "evidence link" stored directly on the absence request.
-- Append-only forward migration: 0001, 0002 and 0003 are ALREADY APPLIED and
-- are NOT modified. This migration only touches the absence subsystem.
--
-- The link rides on absence_requests under the existing ar_select policy
-- (user_id = auth.uid() or public.is_officer()), so its visibility is exactly
-- the owner-or-officer rule the request already uses — no new policy needed.
--
-- The 'reviewers' bucket, its table, and its rv_* / rv_obj_* policies are
-- UNRELATED to absences and are deliberately LEFT INTACT by this migration.
-- =====================================================================

-- 1) Add the optional evidence link. Nullable; a permissive http(s) CHECK is a
--    light defense-in-depth backstop that mirrors the client-side validation
--    (the client gate is the primary one). NULL is always allowed.
alter table public.absence_requests
  add column evidence_url text,
  add constraint absence_evidence_url_http
    check (evidence_url is null or evidence_url ~* '^https?://');

-- 2) Tear down the excuse-attachments subsystem that 0003 created.
--    Drop the four storage.objects policies 0003 created for the
--    'excuse-attachments' bucket (exact names from 0003).
drop policy if exists ea_insert        on storage.objects;
drop policy if exists ea_select_own    on storage.objects;
drop policy if exists ea_select_officer on storage.objects;
drop policy if exists ea_delete_own    on storage.objects;

--    Drop the absence_attachments table. CASCADE removes its RLS policies
--    (aa_select / aa_insert / aa_delete) and its GRANTs along with it.
drop table if exists public.absence_attachments cascade;

-- 3) MANUAL step (bucket rows live in storage.buckets and are managed through
--    the dashboard, not SQL): delete the 'excuse-attachments' BUCKET row in the
--    Supabase dashboard (Storage -> Buckets) after applying this migration. The
--    'reviewers' bucket must be LEFT INTACT.
