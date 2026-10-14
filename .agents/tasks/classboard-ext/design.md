# Design — Class To-Do Board Extension (classboard-ext)

## Overview

This design extends the existing React 18.3.1 + TS 5.5.4 + Vite 5.4.3 + `@supabase/supabase-js` 2.45.4 app (Vitest for tests) with five capability groups: a top navigation across three pages, officer-managed **events**, a per-account **personal task tracker**, a **month calendar** view, an **absences** (excuse submission) workflow with private attachments, and a **reviewers** (shared study files) page.

The guiding principle is to extend, not reinvent. All schema changes land in one new migration `supabase/migrations/0003_classboard_ext.sql`; `0001_init.sql` and `0002_deadline_timestamptz.sql` are untouched. Every pattern already proven in the repo is reused verbatim: `public.is_officer()` for officer gating (never re-implemented), explicit table `GRANT`s to `anon`/`authenticated`, RLS policies that name roles explicitly, `useRealtimeTable` for live reconcile, pure derivation in `src/lib/` behind unit tests, the shared `Modal` for every dialog, `mutations.ts`-style write wrappers that trust RLS, and CSS-variable theme tokens resolved through `theme-core.ts` with WCAG-AA guards. The locked stack is: React + TypeScript + Vite + `@supabase/supabase-js` + Supabase (Postgres + Auth + Realtime + Storage) + Vitest. **No new runtime dependency is added** (see Navigation decision).

Below, each open design decision is resolved with reasoning, then the full `0003` migration shape, the new pure functions and their tests, the new types, the data hooks/mutations, the components, the theme tokens, and the test plan — all tied to concrete file paths.

---

## Resolved design decisions

### OD-1 — Navigation approach: state-based page switching (no router)

**Decision:** Implement a lightweight state-based page switch in a new `src/context/NavProvider.tsx` + a `src/components/Nav.tsx` top bar. **Do not add `react-router`.**

**Reasoning:** The app is a single bundle with three flat pages and no requirement for shareable deep links or browser-history semantics in the requirements (FR-0.x never mentions URLs). Adding a router pins a new dependency, pulls in history/route-matching machinery, and would be the only client-side routing in a codebase that has deliberately stayed dependency-light (the only runtime dep is `@supabase/supabase-js`). A `page: 'board' | 'absences' | 'reviewers'` state value in a small context is simpler, fully testable, and matches the existing `SessionProvider`/`ThemeProvider` context pattern. If deep-linking is wanted later, `history.pushState` can be layered onto the same provider without a routing library.

The provider exposes `{ page, setPage }`. `App.tsx` wraps `NavProvider` inside `ThemeProvider` (so nav state can live alongside theme) and renders a `PageRouter` component that switches on `page`:

- `board` → the existing `Layout` board (always available, anon-readable).
- `absences` → `AbsencesPage`, but gated.
- `reviewers` → `ReviewersPage`, but gated.

**Sign-in gating (FR-0.3):** gating is a UI convenience layered over the real RLS boundary. `AbsencesPage`/`ReviewersPage` read `useSession()`; when `session == null` they render a `SignInGate` block (a short prompt with a "Sign in" button that opens the existing `AuthDialog` via `Modal`) **instead of** fetching or rendering data. This is defense-in-depth only — the DB denies anon reads on these tables regardless (see RLS below), so a signed-out visitor can never retrieve rows even if the gate were bypassed. If a user signs out while on a gated page, the page re-renders to the gate automatically because it reads live session state.

The `Nav` bar renders three real `<button>`s (not links) with `aria-current="page"` on the active one (FR-0.5), each wired to `setPage`. The existing `Header` elements are **not duplicated**. Today `Header.tsx` has all its controls inline in a single component (the Appearance button, the officer-only Members button, the account name, and the sign-in/sign-out button, each with inline style objects and local `showAuth`/`showAdmin`/`showAppearance` state) — there is **no** already-extracted cluster to reuse. The work is therefore a genuine **extraction/refactor**, not reuse: pull the right-hand controls (Appearance button + `AppearancePanel` modal, Members button + `AdminPanel` modal, account-name span, sign-in/sign-out button + `AuthDialog` modal, and the three `show*` state hooks) out of `Header` into a shared sub-component (`src/components/AccountControls.tsx`) that both `Header` and `Nav` compose. The three page buttons live in `Nav`; `Header` keeps the logo and title and composes `AccountControls`. See Components → Nav for the exact split.

### OD-2 — Absence subjects-affected storage: `subject_ids uuid[]` column

**Decision:** Store affected subjects as a `subject_ids uuid[]` column on `absence_requests`, plus a boolean `all_classes`. **No join table.**

**Reasoning:** The subjects-affected set is a small, write-once-with-the-request, read-with-the-request value owned entirely by the parent row. A join table (`absence_request_subjects`) would require its **own** RLS policies that re-derive the same owner-or-officer privacy rule as the parent — doubling the surface area of the most privacy-sensitive feature and creating a second place a policy bug could leak medical data. Keeping the set inline on the parent means the single row-level privacy policy on `absence_requests` governs the whole record atomically. We never need to query "all requests affecting subject X" as a first-class relational join (the officer inbox filters client-side over already-authorized rows), so the relational-normalization argument does not apply. `all_classes boolean` is a separate column: when `true` the UI shows "All classes" and `subject_ids` is ignored for display; a CHECK requires that either `all_classes` is true **or** `subject_ids` is non-empty, written as `all_classes or cardinality(subject_ids) >= 1`, so a request always names its scope. (`cardinality('{}')` returns `0`, not `NULL`; the obvious-looking `array_length(subject_ids, 1)` must NOT be used here because `array_length('{}', 1)` is `NULL`, and a CHECK passes on `NULL` as well as on `TRUE` — so that form would silently accept an unscoped request with `all_classes = false` and an empty array. `cardinality` is the correct, non-NULL form; `coalesce(array_length(subject_ids, 1), 0) >= 1` is an equivalent alternative.) FKs on `uuid[]` are not enforceable in Postgres; subject existence is validated client-side at submit and is non-critical (a deleted subject simply renders as "Unknown subject" — acceptable for an archival record).

### OD-3 — `events.subject_id` on-delete behavior: `on delete set null`

**Decision:** `subject_id uuid references public.subjects(id) on delete set null`.

**Reasoning:** `subject_id` is already nullable (a `school_event` may have none — FR-1.4), so `set null` is representable and non-destructive. An event is a standalone calendar entity with its own title, date, and type; deleting a subject should not erase the historical/scheduled event. This also contrasts intentionally with `tasks.subject_id` (which is `not null ... on delete cascade` in `0001` because a task is meaningless without its subject). The event simply loses its subject association and the UI renders it without a subject label.

### OD-4 — Realtime for the private absence tables: publish `events`, `task_completions`, `reviewers`; do NOT publish the absence tables

**Decision:**
- `events` → **added** to `supabase_realtime` (FR-1.6 requires live reconcile for everyone, including anon). SELECT policy is `using(true)`, so **default replica identity is sufficient** — no `replica identity full`.
- `task_completions` → **added** to `supabase_realtime` for cross-device persistence (FR-2.8). Its SELECT policy is **row-dependent** (`user_id = auth.uid()`), so per the explicit contract in `0001_init.sql` and SETUP.md §5 we **set `replica identity full`** on it. Reasoning below.
- `reviewers` → **added** to `supabase_realtime` so a new upload appears live on other signed-in clients. SELECT policy is `to authenticated using (true)` (row-independent across authenticated users), so **default replica identity is sufficient**.
- `absence_requests` / `absence_attachments` → **NOT published.** These pages **refetch on demand** (on page open, after a mutation, and on window focus) instead.

**Per-role delivery outcome for every published table (a publication is table-global; delivery is RLS-gated per subscriber):**
- `events` → an **anon** subscriber **receives changes** (`events_read` is public, intended); authenticated subscribers also receive them.
- `task_completions` → an **anon** subscriber has **no grant and no policy**, so it **receives nothing**; only the owning authenticated subscriber receives their own rows (`tc_select` is `user_id = auth.uid()`).
- `reviewers` → an **anon** subscriber has **no grant and no policy**, so it **receives nothing**; only authenticated subscribers get rows (`rv_select` is `to authenticated using (true)`).
- `absence_requests` / `absence_attachments` → not in the publication at all, so no subscriber of any role receives streamed changes (already stated above).

**Reasoning for not publishing the absence tables:** Realtime broadcasts respect RLS, but publishing a highly sensitive, row-dependent table widens the blast radius (every officer client holds an open subscription streaming medical-adjacent rows; a future policy regression would leak live). The absences UX does not need sub-second liveness — a member sees their own request immediately via optimistic/refetch after submit, and an officer inbox that refetches on open and after each status change is entirely adequate for a review workflow. Avoiding the publication keeps the privacy-critical path to a single, auditable SELECT policy with no streaming surface. The officer **pending-count badge** (FR-0.4) is sourced from a lightweight `count` query refetched on nav mount, page open, and after any officer status change — not from a live subscription.

**Reasoning for `replica identity full` on `task_completions`:** its SELECT policy is `user_id = auth.uid()` (row-dependent). Under the default replica identity only the PK is in the `old` payload; `0001`'s contract requires `replica identity full` for any published table whose row-dependent SELECT policy may need `old`-row columns to authorize UPDATE/DELETE delivery. `task_completions` has a composite PK `(user_id, task_id)` — `user_id` *is* part of the PK, so it is technically present under default identity — but DELETE delivery authorization reads `user_id` and we follow the documented rule literally rather than relying on the composite-PK coincidence, which is fragile and easy to break if the PK ever changes. `alter table public.task_completions replica identity full;` is included in `0003`. The reconcile in `useRealtimeTable` already keys only on `id`; since `task_completions` has no single `id`, this hook uses a **composite-key variant** (see Data layer).

### OD-5 — Signed-URL flow for both buckets

**Decision:** All downloads use **short-lived signed URLs minted on demand per click**, never public URLs.

- **Expiry:** 60 seconds. Long enough to start a download/open in a new tab, short enough that a leaked URL is near-useless. Expiry is a shared constant `SIGNED_URL_TTL_SECONDS = 60` in `src/lib/storage.ts`.
- **excuse-attachments (private bucket):** download is per-click. The attachment row carries `storage_path`; on click, call `supabase.storage.from('excuse-attachments').createSignedUrl(storage_path, 60)` and open the returned URL. Minting is on demand (not batched at list time) so URLs are not generated for files the user never opens and never sit in the DOM. RLS on `storage.objects` still governs whether the signed URL can even be minted — a member minting another member's path is denied by the storage SELECT policy, so a guessed path yields an error, not a file (FR-4.P6, AC 7). This is the second of two independent layers: the first is that a non-owner never learns another member's `storage_path` at all, because `aa_select` returns them zero `absence_attachments` rows (see the `absence_attachments` policy block). So cross-member attachment access is blocked both because the path is never disclosed and because, even if guessed, the mint is denied — stated as a single defense-in-depth guarantee here and in the policy block.
- **reviewers (private-but-authenticated bucket):** same per-click `createSignedUrl(path, 60)` flow, where `path` is the row's `storage_path` (`{uploader_id}/{reviewer_id}/{safeName}`, pinned to the row `id` — see `buildStoragePath` and `createReviewer`). The bucket is **not public**; only authenticated users can mint URLs (anon has no storage SELECT grant/policy), satisfying "every signed-in user can download, anon cannot" (AC 11). The card's Download button triggers the mint-then-open.
- **Download UX — concrete mechanism:** the HTML `download` attribute on an anchor is **ignored for cross-origin URLs**, and a Supabase signed URL always resolves to the Storage host (`<project>.supabase.co/storage/v1/object/sign/...`), a different origin from the app — so a plain `<a download>` would navigate/open instead of forcing a save and would not apply `file_name`. The design therefore does **not** rely on the anchor `download` attribute. Instead it uses the SDK's own content-disposition option, which was verified against the installed `@supabase/supabase-js` **2.45.4** (`@supabase/storage-js` `StorageFileApi.createSignedUrl(path, expiresIn, options?)` where `options.download?: string | boolean` — "triggers the file as a download if set to true; set this parameter as the name of the file to trigger the download with a different filename"). For **reviewers** we call `createSignedUrl(path, 60, { download: fileName })`; Storage then returns `Content-Disposition: attachment; filename="<fileName>"` on the signed URL, so simply navigating to it (e.g. `window.location.assign(url)` or a programmatically clicked anchor **without** needing the `download` attribute) forces a save with the correct name across origins. For **excuse attachments** officers usually want to *preview* (PDF/image), so we mint with `{ download: false }` (default) and open in a new tab for inline viewing; a separate "Download" affordance can mint with `{ download: file_name }` when a saved copy is wanted. A per-row `busy`/`error` state covers the brief mint latency and any denial. (The alternative — `fetch()` the URL into a `Blob`, create a same-origin object URL, drive the anchor, then revoke — is noted as a fallback only if a future SDK drops the `download` option; it costs up to 20 MB of memory per reviewer download, so the native option is preferred.)

**Reasoning:** On-demand minting minimizes the window and volume of live URLs and keeps authorization at the storage layer. 60 s matches Supabase's typical short-lived pattern and is ample for a click-to-open. Using the SDK's `download` option puts the `Content-Disposition` on the Storage response itself, which is the only reliable cross-origin way to force a save with a chosen filename.

### OD-6 — Bucket creation mechanism: policies in SQL, bucket creation + MIME/size limits as a documented manual step

**Decision:** `0003` contains the `storage.objects` **RLS policies** (these are ordinary policies on a table in the `storage` schema and are reproducibly expressible in SQL) and the per-folder/own-folder logic. **Bucket creation and the bucket-level allowed-MIME/size config are a manual Supabase dashboard (or CLI) step documented in SETUP.md**, because bucket rows live in `storage.buckets` and the allowed-MIME/file-size-limit are bucket attributes that Supabase expects to be set via the Storage API/dashboard, not hand-inserted, and whose exact column shape is version-dependent.

**What `0003` does for storage (SQL):**
- Enables and writes four `storage.objects` policies for `excuse-attachments` (member own-folder INSERT, member own-folder SELECT, officer SELECT-all, member own-folder DELETE **only while the parent request is still `pending`** — the storage DELETE policy carries an `EXISTS` subquery on `absence_requests` keyed on the `{request_id}` path segment so it mirrors the table-level `aa_delete` rule exactly; a certificate cannot be deleted once an officer has acknowledged the request) and three for `reviewers` (authenticated own-folder INSERT, authenticated SELECT-all, owner-or-officer DELETE). Folder ownership is enforced with `(storage.foldername(name))[1] = auth.uid()::text` (the first path segment is the `{user_id}` folder).
- Grants are not needed on `storage.objects` for the client (Supabase ships the base grants); policies are the gate.

**What SETUP.md documents as manual steps (OD-5/OD-6):**
1. Create a **private** bucket `excuse-attachments` (public = off), allowed MIME types `application/pdf, image/jpeg, image/png`, file size limit `5 MB`.
2. Create a bucket `reviewers` with public = off, allowed MIME types `application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.presentationml.presentation, image/jpeg, image/png`, file size limit `20 MB`.
3. Apply `0003` (which adds the storage.objects policies, the five tables, enums, grants, RLS, publication, and `replica identity full` on `task_completions`).
4. Confirm anon has no access to either bucket (no anon storage policy is created).

**Reasoning:** This split keeps everything deterministically reproducible-in-SQL where Supabase supports it (policies), and defers only the two bucket rows and their attribute config — the parts the platform wants created through its own API — to a short, explicit SETUP checklist. The server-side MIME/size enforcement (FR-4.P5, FR-5.2) is the bucket's allowed-MIME-types + size-limit config, which is why those values are specified exactly in the manual steps rather than left vague.

---

## `0003_classboard_ext.sql` — full migration shape

Follows `0001`'s section ordering and conventions: enums first, then tables, then `enable row level security`, then table-level `GRANT`s, then policies (named, role-explicit), then publication/replica-identity. **Reuses `public.is_officer()`** everywhere officer gating is needed; never redefines it. All comments mirror `0001`'s explanatory style.

### Enums

```
create type public.event_type       as enum ('school_event', 'quiz', 'exam', 'presentation');
create type public.absence_reason    as enum ('illness', 'family_emergency', 'school_related_activity', 'other');
create type public.absence_status    as enum ('pending', 'acknowledged', 'needs_followup');
```

### Tables

**`public.events`** (FR-1.4)
```
id          uuid primary key default gen_random_uuid()
title       text not null
type        public.event_type not null
subject_id  uuid references public.subjects(id) on delete set null   -- nullable (OD-3)
event_date  date not null
start_time  time
end_time    time
location    text not null default ''
notes       text not null default ''
created_by  uuid references public.profiles(id) on delete set null
created_at  timestamptz default now()
-- Time pairing: either no times at all, or a start is present (an end is
-- optional, and when present must be >= start). This FORBIDS a bare end with a
-- null start, which the form never produces (start/end are a pair) and which
-- the looser `end is null or start is null or end >= start` form would have
-- silently allowed. Boundary: start-only is valid; start==end is valid.
constraint events_time_order check (
  (start_time is null and end_time is null)
  or (start_time is not null and (end_time is null or end_time >= start_time)))
```

**`public.task_completions`** (FR-2.3/2.4)
```
user_id      uuid not null references public.profiles(id) on delete cascade
task_id      uuid not null references public.tasks(id)    on delete cascade
completed_at timestamptz not null default now()
primary key (user_id, task_id)
```
Both FKs cascade (FR-2.4). No surjective `id` column — the composite PK is the identity.

**`public.absence_requests`** (FR-4.4/4.5, OD-2)
```
id              uuid primary key default gen_random_uuid()
user_id         uuid not null references public.profiles(id) on delete cascade
date_from       date not null
date_to         date not null
subject_ids     uuid[] not null default '{}'
all_classes     boolean not null default false
reason_category public.absence_reason not null
explanation     text not null default ''
status          public.absence_status not null default 'pending'
officer_remark  text
reviewed_by     uuid references public.profiles(id) on delete set null
reviewed_at     timestamptz
created_at      timestamptz default now()
constraint absence_date_range check (date_to >= date_from)
constraint absence_explanation_len check (char_length(explanation) <= 500)
constraint absence_scope check (all_classes or cardinality(subject_ids) >= 1)
```

**`public.absence_attachments`** (FR-4.6)
```
id          uuid primary key default gen_random_uuid()
request_id  uuid not null references public.absence_requests(id) on delete cascade
storage_path text not null
file_name   text not null
mime_type   text not null
size_bytes  bigint not null
constraint attach_mime check (mime_type in ('application/pdf','image/jpeg','image/png'))
constraint attach_size check (size_bytes > 0 and size_bytes <= 5 * 1024 * 1024)
```

**`public.reviewers`** (FR-5.3)
```
id           uuid primary key default gen_random_uuid()
uploader_id  uuid not null references public.profiles(id) on delete cascade
subject_id   uuid not null references public.subjects(id) on delete cascade
title        text not null
description  text
storage_path text not null
file_name    text not null
mime_type    text not null
size_bytes   bigint not null
created_at   timestamptz default now()
constraint reviewer_size check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024)
constraint reviewer_mime check (mime_type in (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png'))
```
(The MIME CHECK above mirrors the five allowed types enforced by the bucket config; it is defense in depth alongside the bucket's allowed-MIME list.)

**Size-limit coupling (NIT4):** there are two independent server-side size enforcers — the DB `attach_size` / `reviewer_size` CHECK on the row and the bucket's `file_size_limit`. They live in two different places (this migration vs the manual bucket step in SETUP.md) and **must be kept in lockstep** (a comment in each should reference the other), because a dashboard-only bump would silently diverge from the CHECK. The **bucket `file_size_limit` is the authoritative byte cap** (it rejects the actual uploaded bytes); the DB CHECK validates only the client-supplied `size_bytes` *metadata* on the row (a self-reported number), so it guards the recorded value and is not a true byte cap.

### Enable RLS
```
alter table public.events              enable row level security;
alter table public.task_completions    enable row level security;
alter table public.absence_requests    enable row level security;
alter table public.absence_attachments enable row level security;
alter table public.reviewers           enable row level security;
```

### Table-level GRANTs (per `0001`'s "privileges gate access FIRST" doctrine)
```
-- events: public read, officer writes (mirrors tasks)
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

-- task_completions: authenticated-only, no anon at all
grant select, insert, delete on public.task_completions to authenticated;

-- absences: authenticated-only read/write; NO grant to anon (privacy)
grant select, insert, update, delete on public.absence_requests to authenticated;
grant select, insert, update, delete on public.absence_attachments to authenticated;

-- reviewers: authenticated read + write; NO anon
grant select on public.reviewers to authenticated;
grant insert, delete on public.reviewers to authenticated;
```
Note the deliberate omissions: `anon` gets **no** grant on `task_completions`, the absence tables, or `reviewers` — defense in depth beneath the policies.

### Policies

**events** (FR-1.5 — exact `tasks` pattern):
```
create policy events_read  on public.events for select to anon, authenticated using (true);
create policy events_write on public.events for all    to authenticated
  using (public.is_officer()) with check (public.is_officer());
```

**task_completions** (FR-2.5 — own rows only):
```
create policy tc_select on public.task_completions for select to authenticated
  using (user_id = auth.uid());
create policy tc_insert on public.task_completions for insert to authenticated
  with check (user_id = auth.uid());
create policy tc_delete on public.task_completions for delete to authenticated
  using (user_id = auth.uid());
```
No UPDATE policy or grant — completion is a toggle expressed as insert/delete, never update.

**absence_requests** (FR-4.P1, FR-4.11 — owner-or-officer read; owner writes with status gating):
```
-- Read: owner OR officer. NEVER using(true); anon has no grant anyway.
create policy ar_select on public.absence_requests for select to authenticated
  using (user_id = auth.uid() or public.is_officer());

-- Insert: only as yourself, only in pending status.
create policy ar_insert on public.absence_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- Member update: own row AND only while still pending (FR-4.11). The USING
-- gates which existing rows are updatable (must currently be pending & yours);
-- the WITH CHECK forbids a member from flipping status/officer fields.
create policy ar_update_member on public.absence_requests for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending'
              and officer_remark is null and reviewed_by is null);

-- Officer update: may set status/remark/review fields on any row.
create policy ar_update_officer on public.absence_requests for update to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- Member delete: own row only while pending (FR-4.11).
create policy ar_delete_member on public.absence_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');
```
Policies are OR-composed (as `0001`'s profiles policies are), so an officer passes `ar_update_officer` and a member passes the member policies only within their constraints. A member cannot read, edit, or delete another member's request through any of these (AC 7, AC 9).

**absence_attachments** (FR-4.P1 — mirror the parent's owner-or-officer via a subquery on the parent):
```
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
```
The attachment's access is always derived from its parent request's ownership, so the privacy rule has a single source of truth. (`is_officer()` is SECURITY DEFINER and bypasses RLS internally, so the subquery does not recurse — same safety argument as `0001`.)

**Two-layer guarantee for AC 7 / FR-4.P6 (made explicit):** a non-owner, non-officer cannot read the `absence_attachments` row at all because `aa_select`'s `EXISTS` fails for them — so `storage_path` (the only thing an attacker would need in order to construct a signed-URL request) is **never disclosed** to them in the first place. And even if a path were somehow guessed, the signed-URL **mint is independently denied** at the storage layer by `ea_select_own` / `ea_select_officer` (a non-owner is not an officer and the folder's `[1]` segment is not their uid). These two layers each independently prevent cross-member attachment access; neither relies on the other. The attachment-list fetch (which returns the table rows, including `storage_path`, for a given `request_id`) therefore returns **zero rows** to a second member querying another member's `request_id`, and the per-click mint (OD-5) is the second, independent gate.

**reviewers** (FR-5.4/5.5 — authenticated read-all, own-insert, owner-or-officer delete):
```
create policy rv_select on public.reviewers for select to authenticated using (true);
create policy rv_insert on public.reviewers for insert to authenticated
  with check (uploader_id = auth.uid());
create policy rv_delete on public.reviewers for delete to authenticated
  using (uploader_id = auth.uid() or public.is_officer());
```
No UPDATE policy (FR says upload + delete only; editing is out of scope).

### storage.objects policies (OD-6)

For `excuse-attachments` (bucket_id check + own-folder first segment):
```
-- INSERT mirrors the table-level aa_insert exactly: not only must the object
-- land in the caller's own {user_id}/ folder (segment [1]), but segment [2]
-- ({request_id}) must name a request the caller OWNS and that is still PENDING.
-- Without the EXISTS gate the storage layer would be weaker than aa_insert: a
-- member could upload objects under an acknowledged request's folder (defeating
-- FR-4.11 for the sensitive certificate at the storage layer) or into arbitrary
-- own-folder subpaths with no matching row (orphans). Ordering dependency: the
-- absence_requests row MUST be inserted before any attachment object is
-- uploaded (createAbsenceRequest -> upload -> addAbsenceAttachment already does
-- insert-first), because this WITH CHECK requires the parent to exist and be
-- pending at upload time.
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
-- Mirror the table-level pending-only rule (aa_delete) so a member cannot
-- delete the certificate file itself after an officer has acknowledged the
-- request. Without the EXISTS gate a member could delete the storage object
-- (bypassing FR-4.11 for the most sensitive artifact) and orphan the
-- absence_attachments row, leaving the officer inbox a URL that 404s.
-- The storage path layout is {user_id}/{request_id}/filename, so segment [2]
-- is the request id; we require a still-pending request owned by the caller.
create policy ea_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'excuse-attachments'
         and (storage.foldername(name))[1] = auth.uid()::text
         and exists (
           select 1 from public.absence_requests r
           where r.id::text = (storage.foldername(name))[2]
             and r.user_id = auth.uid()
             and r.status = 'pending'));
```
For `reviewers`:
```
create policy rv_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reviewers'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy rv_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'reviewers');          -- any signed-in user may read/download
create policy rv_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reviewers'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_officer()));
```
No anon policy on either bucket → anon cannot mint a signed URL (AC 11). A guessed path for someone else's excuse file fails `ea_select_own` and the user is not an officer, so the mint is denied (AC 7, FR-4.P6).

### Publication + replica identity (OD-4)
```
alter publication supabase_realtime add table public.events, public.task_completions, public.reviewers;
-- task_completions has a row-dependent SELECT policy -> follow the 0001 contract.
alter table public.task_completions replica identity full;
-- absence_requests / absence_attachments are intentionally NOT published.
```

---

## New pure functions in `src/lib/` (unit-tested, no React/Supabase/browser globals)

All of these follow the string-date discipline in `derive.ts` (compare `'YYYY-MM-DD'` lexically; `localTodayISO` for "today"; never pass a date-only string through `new Date()` for comparison).

### `src/lib/derive.ts` — viewer-dependent glow (FR-2.9/2.10, replaces `subjectHasPending`'s sole use)

Add a new function and keep `subjectHasPending` for the signed-out path (its existing tests stay green):

```
subjectGlows(
  subjectId: string,
  tasks: Task[],
  viewer: { signedIn: boolean; completedTaskIds: Set<string> } | null,
): boolean
```
- Signed-out (`viewer == null` or `!viewer.signedIn`): glows iff any task for the subject is `pending` → delegates to `subjectHasPending`.
- Signed-in: glows iff there is ≥ 1 task for the subject that is `pending` **and** whose id is **not** in `completedTaskIds` (unfinished-for-me).

`ScheduleGrid`/`ScheduleCell` call `subjectGlows` with the viewer derived from session + the `task_completions` id set.

### `src/lib/events.ts` — upcoming-event-within-7-days badge (FR-1.9/1.10)

```
hasUpcomingAssessment(
  subjectId: string,
  events: EventItem[],
  today: string = localTodayISO(),   // 'YYYY-MM-DD'
): boolean
```
True iff some event has `subjectId === subjectId`, `type ∈ {quiz, exam, presentation}` (school_event excluded), and `today <= event_date <= today+7` inclusive. Date math is done on `'YYYY-MM-DD'` strings via a small `addDaysYMD(ymd, n)` helper (also in this file) that parses to y/m/d integers, adds via a UTC-midnight `Date` purely for calendar arithmetic, and re-formats with zero-padding — never leaking a `Date` into comparisons. Boundary: exactly 7 days away is included; 8 is not; today is included; past is excluded.

### `src/lib/calendar.ts` — month-grid construction (FR-3.2/3.3/3.7/3.8)

```
buildMonthGrid(year: number, month0: number, today: string): MonthCell[]   // 6x7, Monday-first, includes Sat & Sun
bucketItemsByDay(cells: MonthCell[], items: CalendarItem[]): Map<string, CalendarItem[]>
visibleWithOverflow(items: CalendarItem[], max = 3): { shown: CalendarItem[]; moreCount: number }
```
- `MonthCell = { dateYMD: string; inMonth: boolean; isToday: boolean }`. Grid is always 6 rows × 7 columns, Monday-first (`day 1=Mon .. 7=Sun`), leading days from the previous month and trailing from the next flagged `inMonth=false`. "Includes Saturday" is automatic in a 7-column week; Sunday is also present (a 7-col Mon-first week necessarily ends on Sun) and is simply a non-class day.
- `CalendarItem` is a normalized union of a task (keyed on its deadline **date part**, `deadlineDatePart` from `derive.ts`) and an event (keyed on `event_date`), each carrying `kind` (`'task' | 'event'`), `type`, `title`, `id`, `datePart` (`'YYYY-MM-DD'`), `startTime` (`'HH:MM:SS' | null`; always `null` for a task, so timed events sort after date-only items on the same day), and (for tasks) a `done` flag for the dimming (FR-3.6). The merged-list sort in `TaskList` and the calendar bucketing both read these fields, so there is one normalization.
- `bucketItemsByDay` groups items into `dateYMD` buckets; `visibleWithOverflow` yields the first `max` plus `moreCount = max(0, len - max)` for the "+N more" indicator (FR-3.3). The cutoff is "> 3 shows +N", i.e. 3 items show all three, 4 items show three + "+1 more".

### `src/lib/storage.ts` — file validation + signed-URL helper surface (FR-4.3, FR-5.2, OD-5)

Pure validation (unit-tested); the `createSignedUrl` call itself is a thin wrapper tested via the data layer, not here.
```
SIGNED_URL_TTL_SECONDS = 60
EXCUSE_MIME = ['application/pdf','image/jpeg','image/png']; EXCUSE_MAX = 5*1024*1024
REVIEWER_MIME = [...5 types]; REVIEWER_MAX = 20*1024*1024
validateFile(file: {type,size,name}, allowed: string[], maxBytes: number): { ok: true } | { ok: false; reason: 'type' | 'size' }
buildStoragePath(userId: string, requestOrOwnerSegment: string, fileName: string): string  // `${userId}/${seg}/${safeName}`
sanitizeFileName(name: string): string   // strip path separators / collapse spaces; keep extension
```
`buildStoragePath` enforces the `{user_id}/{request_id}/filename` (excuse) and `{uploader_id}/{reviewer_id}/filename` (reviewer) layouts the storage policies key on. The reviewer middle segment is **always the reviewer row `id`** (no ambiguous "or a fresh uuid"): the `id` is generated client-side with `crypto.randomUUID()` **before** the upload and passed as `reviewers.id` on insert, so the object is deterministically locatable from the row and vice versa. This makes officer moderation delete and any future cleanup able to reconstruct the exact object path from the row.

### `src/lib/datewindow.ts` — absence date-range math (FR-4.5, officer date filter FR-4.8)

```
isValidRange(from: string, to: string): boolean       // to >= from, both 'YYYY-MM-DD'
rangeOverlaps(a: {from,to}, b: {from,to}): boolean     // for the officer date-range filter
```

### Unit-test plan for the pure functions (`*.test.ts` next to each, Vitest, matching `derive.test.ts`)

- `derive.test.ts` (extend): `subjectGlows` — signed-out glows on any pending; signed-in glows only on an unfinished pending; signed-in with the only pending task completed → no glow; done tasks never glow either way; viewer `null` behaves as signed-out.
- `events.test.ts`: `hasUpcomingAssessment` — includes quiz/exam/presentation, excludes school_event; boundaries exactly today, exactly +7 (included), +8 (excluded), yesterday (excluded); subject isolation; `addDaysYMD` month/year rollover.
- `calendar.test.ts`: `buildMonthGrid` — Monday-first ordering, 42 cells, leading/trailing `inMonth=false` days of adjacent months, `isToday` detection, a month starting on Sunday (max leading days) and one starting on Monday (zero leading); `bucketItemsByDay` places a task on its deadline **date part** and an event on its date; `visibleWithOverflow` at exactly 3 (no "+more"), exactly 4 (`moreCount 1`), 0 items.
- `storage.test.ts`: `validateFile` type-reject, size-reject (exactly at limit passes, 1 byte over fails), ok case; `sanitizeFileName` strips `/` and `..`; `buildStoragePath` shape.
- `datewindow.test.ts`: `isValidRange` equal dates ok, reversed rejected; `rangeOverlaps` touching, nested, disjoint.

---

## New types — `src/lib/types.ts`

Add row + domain pairs mirroring the existing snake→camel convention and date contract comments:

- `EventType`, `AbsenceReason`, `AbsenceStatus` string-literal unions matching the enums.
- `EventRow` / `EventItem` (`event_date`/`eventDate` is date-only `'YYYY-MM-DD'`; `start_time`/`end_time` are `'HH:MM:SS' | null`).
- `TaskCompletionRow` (`user_id`, `task_id`, `completed_at`) / domain `TaskCompletion`.
- `AbsenceRequestRow` / `AbsenceRequest` (`subject_ids: string[]`, `all_classes`, enum fields, nullable officer fields).
- `AbsenceAttachmentRow` / `AbsenceAttachment`.
- `ReviewerRow` / `Reviewer`.
- `CalendarItem` and `MonthCell` (consumed by `calendar.ts` and the calendar components).

---

## Data layer — hooks & mutations (follow `src/data` patterns)

**Profiles-embed rule (privacy — mandatory):** every `profiles` embed on the Absences and Reviewers pages selects **`name` only** — `student:profiles!absence_requests_user_id_fkey(name)` for the officer absence inbox and `uploader:profiles!..._fkey(name)` for reviewer cards — **never** `profiles(*)` and **never** `email`. `profiles_read` in `0001` is `using(true)` for both `anon` and `authenticated` and therefore also exposes `email` (0001's own comment flags this email implication), so a `profiles(*)` embed would surface a student's email alongside sensitive medical-adjacent data. The embeds below already select only `name`; this rule makes that constraint explicit so an implementer must keep it everywhere a profile is embedded on these pages.

### Reads

- `src/data/useEvents.ts` — thin wrapper over `useRealtimeTable<EventRow, EventItem>('events', rowToEvent)`, exactly like `useTasks`. Public, unconditional fetch, live reconcile for everyone (FR-1.6, AC 2). Wired into `Layout` alongside the existing three hooks and passed to `TaskList`, `ScheduleGrid`, and the calendar.
- `src/data/useTaskCompletions.ts` — a **composite-key** realtime hook. Because `task_completions` has no single `id`, factor a `useRealtimeTableKeyed` variant out of `useRealtimeTable` that takes a `keyOf(row)` (here `` `${user_id}:${task_id}` ``) used for INSERT/UPDATE/DELETE reconcile instead of `.id`. The hook exposes `completedTaskIds: Set<string>` plus the raw rows, and keeps them in sync across devices via Realtime (FR-2.8). Unlike the base `useRealtimeTable` (whose documented contract is "never looks at the session"), this variant is **session-aware** and **keys its effect on the session user id**:
- **On sign-in (or if already signed in on mount):** fetch own rows + subscribe to the keyed Realtime channel.
- **On sign-out (`session == null`):** unsubscribe/tear down the channel and **reset `completedTaskIds` to an empty set**, so `subjectGlows` immediately falls back to the signed-out rule (any pending task glows — FR-2.9) rather than keeping a stale signed-in completion set.
- **On a session user change** (sign out of A, into B): the effect re-runs because the dependency is the user id, tearing down A's subscription and fetching B's rows — never mixing two users' completion sets.

This session gate is legitimate because anon has **no grant** on `task_completions` (so a signed-out fetch would legitimately return zero rows anyway); it never gates public board data. The session-transition behavior (subscribe on sign-in, unsubscribe + reset on sign-out, re-key on user change) is explicitly covered by the hook's focused test (see Testability → Hooks).
- `src/data/useAbsenceRequests.ts` — **refetch-on-demand** (not realtime, OD-4). Exposes `{ data, status, retry, refetch }`; refetches on mount, on window focus, and when a mutation signals success. Two modes: member mode selects own rows (RLS returns only theirs anyway), officer mode selects all. **Officer mode sources student names via an embedded PostgREST relationship.** `absence_requests` has **two** FKs to `profiles` — `user_id` (the student) **and** `reviewed_by` (the officer who reviewed) — so a bare `profiles(name)` embed is **ambiguous** and PostgREST errors at runtime ("more than one relationship was found"). The embed is therefore **disambiguated by the FK constraint name**: `.select('*, student:profiles!absence_requests_user_id_fkey(name)')` (the `student:` alias names the student relationship explicitly; the equivalent column-hint form `profiles!user_id(name)` is also acceptable). This relies on the existing public `profiles_read` policy (verified: `profiles` is readable by `anon`/`authenticated` in `0001`, and the grants permit the embedded select for an officer whose `ar_select` already authorizes the parent rows). The hook maps each row's embedded `student.name` onto a `studentName` field in the domain object. `reviewed_by` is left unembedded (the inbox does not display the reviewing officer's name; if needed later it would get its own aliased embed `reviewer:profiles!absence_requests_reviewed_by_fkey(name)`). The member view does **not** use this embed — it only ever sees its own rows and already knows the account name from `useSession`. A tiny `useAbsencePendingCount.ts` runs a `head: true, count: 'exact'` query on `status=pending` for the nav badge, refetched on nav mount and after officer status changes.
- `src/data/useReviewers.ts` — `useRealtimeTable<ReviewerRow, Reviewer>('reviewers', ...)`; authenticated read, live new uploads.

### Mutations — extend `src/data/mutations.ts` (same `MutationResult`/`classify` contract, trust RLS, no client role checks)

- `addEvent(input)`, `updateEvent(id, patch)`, `removeEvent(id)` — insert/update/delete on `events`; a member/anon attempt is denied by RLS and surfaces `MUTATION_MESSAGES.denied` ("Only officers can do that"), matching the existing task flow (AC 1).
- `markTaskDone(taskId, userId)` → `insert({ user_id, task_id })`; `unmarkTaskDone(taskId, userId)` → `delete().match({ user_id, task_id })`. **Optimistic** (FR-2.8): the toggle updates the local `completedTaskIds` set immediately in the calling component, then calls the mutation; on error it reverts the local change and shows an inline message. The server reconcile (realtime) is the source of truth and will re-add/-remove if the optimistic guess was wrong. This optimistic path is the one deliberate exception to `mutations.ts`'s "no optimistic UI" note — justified by FR-2.8's explicit requirement and the low stakes (a self-only toggle); it is documented as such in the function comment.
- `createAbsenceRequest(input)` + `addAbsenceAttachment(meta)` — insert the request, upload each file to storage (`supabase.storage.from('excuse-attachments').upload(path, file)`), then insert the attachment rows. `createAbsenceRequest` **never sends `status`, `officer_remark`, `reviewed_by`, or `reviewed_at`** — it writes only the member-owned fields (`user_id`, `date_from`, `date_to`, `subject_ids`, `all_classes`, `reason_category`, `explanation`); the DB defaults supply `status = 'pending'` and leave the officer/review fields NULL. This guarantees the `ar_insert` `WITH CHECK (user_id = auth.uid() and status = 'pending')` is always satisfied for a legitimate submit, so a stray status value can never turn into a confusing generic WITH-CHECK failure. On a storage/validation failure, the already-inserted request is left in `pending` (the member can delete it) and the error is surfaced; attachment inserts are attempted after a successful upload only.
- `updateAbsenceStatus(id, { status, officer_remark, reviewed_by })` — officer path; `deleteAbsenceRequest(id)` — member-while-pending path (RLS enforces the window; the UI also hides delete once not pending as convenience).
- `createReviewer(input)` — generate the reviewer `id` client-side (`crypto.randomUUID()`), build the path `{uploader_id}/{id}/{safeName}` via `buildStoragePath`, upload the file to `reviewers`, then insert the row **with that explicit `id`** and `storage_path`. If the upload fails, no row is inserted; if the insert fails after a successful upload, the just-uploaded object is removed (`storage.from('reviewers').remove([path])`) so no orphan is left. Because the `id` is fixed before upload, the object path is deterministic from the row.
- `deleteReviewer(id, storagePath)` — delete the **storage object first** (`storage.from('reviewers').remove([storagePath])`), then delete the row (RLS: owner or officer). Ordering reasoning: if the object delete fails, we abort **before** removing the row, so the card remains in the UI for a retry rather than leaving an orphaned-but-still-mintable file with no row to reconstruct its path. (The reverse order — row-then-best-effort-object — was the prior design and is rejected because a storage failure after the row delete produces exactly that orphan.) A storage-not-found on the object is treated as success (idempotent) so a half-completed prior delete can still be cleaned up. The RLS/storage delete policies (`rv_delete` on the table, `rv_obj_delete` on the object) are the real authorization gate for both steps; the UI's owner/officer check is convenience only.
- `signedUrlFor(bucket, path, opts?: { download?: string | boolean })` — wraps `createSignedUrl(path, SIGNED_URL_TTL_SECONDS, opts)`; returns `{ ok, url }` or a classified error. Callers pass `{ download: file_name }` when they want a forced save with the row's filename (reviewers, and the optional "save a copy" on an attachment) and omit it (inline) when officers preview an attachment in a new tab. This is the single mechanism that honors `file_name` cross-origin (see OD-5 Download UX).

---

## Components (reuse the shared `Modal`, real `<button>`/`<input>`/`<select>`, global focus ring, token colors only)

### Navigation
- `src/context/NavProvider.tsx` — `{ page, setPage }` context (pattern-matches `SessionProvider`).
- `src/components/Nav.tsx` — a themed top nav row of three `aria-current`-aware buttons (Board / Absences / Reviewers), with the officer **pending badge** on Absences (count from `useAbsencePendingCount`, hidden when zero or non-officer). Rendered above the board/pages, below or merged with `Header`.
- `src/components/AccountControls.tsx` — **new** shared sub-component extracted from `Header.tsx` (which currently has every control inline, with no reusable cluster). It owns the Appearance button + `AppearancePanel` modal, the officer-only Members button + `AdminPanel` modal, the account-name span, the sign-in/sign-out button + `AuthDialog` modal, and the associated `showAuth`/`showAdmin`/`showAppearance` state. Both `Header` and `Nav` compose it so the auth/appearance/members controls exist in exactly one place (FR-0.2).
- `Header.tsx` — refactor: move the right-side controls out into `AccountControls` (above) and compose it; `Header` retains the logo and title. The three page buttons live in `Nav`.
- `src/components/PageRouter.tsx` — switches on `page`; renders `Layout` (board), `AbsencesPage`, or `ReviewersPage`.
- `src/components/SignInGate.tsx` — the gated-page block for signed-out users (prompt + Sign in button → `AuthDialog` in `Modal`).

### Events
- `src/components/AddEventDialog.tsx` — officer-only form (shown via a new "Add Event" button next to "Add task" in `TaskList`, visible only when `isOfficer`). Fields per FR-1.3: type `<select>` (the four enum values), title (required), subject `<select>` (optional, with a "— none —" option; disabled/none allowed only for `school_event` guidance text), event date (`CalendarField`, reused), optional start/end `<input type="time">`, location, notes. Submits via `addEvent`; no optimistic UI (reconciles via realtime like `AddTaskDialog`). Uses the shared `Modal`.
- `src/components/EventBadge.tsx` — the type badge used in the right-hand list and calendar chips: a token background + an inline icon + text label, so type is never color-only (FR-1.8). Icons: `school_event` → calendar-star, `quiz` → question/clipboard, `exam` → document-check, `presentation` → screen/board (small inline SVGs in the Header icon style).
- `TaskList.tsx` — extend to merge events into the list display. Both tasks and events are normalized through the **same `CalendarItem` shape from `calendar.ts`** (so the list and the month calendar share one merge, avoiding a second ad-hoc interleave). The merged list sort key is explicit: **(1) `datePart` ascending** — a task's deadline date part (`deadlineDatePart` from `derive.ts`) vs an event's `event_date`; **(2) kind-order** (a stable tie-break when a task and an event fall on the same day — tasks before events, chosen so a day's actionable work sorts above its calendar entries); **(3) `startTime` ascending, nulls last** (date-only events sort after timed ones on the same day); **(4) `title` ascending** as the final deterministic tie-break. The React key for each merged row is `` `${kind}:${id}` `` (`kind` ∈ `'task' | 'event'`), so even though a task `id` and an event `id` are both `gen_random_uuid()` (collision effectively impossible), the key is unambiguous and lets the row renderer branch on `kind`. The list item for an event is read-only for members and carries an officer edit/remove affordance (reusing the row control pattern), all RLS-backed.

### Personal tracker
- `TaskRow.tsx` — add a leading checkbox `<input type="checkbox">` bound to `completedTaskIds.has(task.id)`; `onChange` calls the optimistic `markTaskDone`/`unmarkTaskDone`. A completed row gets a `--task-done-*` dimmed + line-through treatment (see tokens) **plus** the checkbox state and an `sr-only` " (done)" so completion is never color-only (FR-2.6). The checkbox only renders when signed in; anon sees the row without it.
- `TaskList.tsx` — add a **filter** control (All / My unfinished / My finished) as a small segmented set of buttons (FR-2.7); filtering is derived from `completedTaskIds` and only shown when signed in.
- `ScheduleGrid.tsx`/`ScheduleCell.tsx` — swap `subjectHasPending` for `subjectGlows(subjectId, tasks, viewer)` so the glow is viewer-dependent (FR-2.9). `ScheduleCell` additionally renders the **upcoming-assessment badge** when `hasUpcomingAssessment(subject.id, events, today)` — a distinct corner marker (different shape + icon + token from the pending dot) with its own `sr-only` label "(assessment within 7 days)" so it reads differently from the pending glow (FR-1.9).

### Month calendar
- `src/components/BoardViewToggle.tsx` — the "Weekly schedule | Month calendar" segmented toggle above the left column (FR-3.1); state lives in `Layout`. The details panel and right-hand list are unchanged.
- `src/components/MonthCalendar.tsx` — renders `buildMonthGrid` output as a 7-column Monday-first grid; each day cell is a focusable real `<button>` (Enter/Space activate, `--focus-ring`) showing up to 3 `EventBadge`/task chips + "+N more" (FR-3.2/3.3/3.9). Prev/next/Today controls (FR-3.4); today highlighted via `isToday`. Clicking a day sets a selected date passed to `DetailsPanel` to list that day's items (FR-3.5). A signed-in user's finished tasks render with the `--task-done` dim on their chip (FR-3.6). Responsive: at the mobile breakpoint cells show **dots** (one per item kind) and the tapped day's items list below (FR-3.10) — reuse the existing `base.css` responsive approach (media query, not JS).

### Absences
- `src/components/AbsencesPage.tsx` — gated; branches on `isOfficer` into member vs officer view; owns loading/empty/error states (FR-4.12) using the existing status/retry pattern.
- `src/components/AbsenceForm.tsx` — the member form (FR-4.2/4.3): date_from/date_to (`CalendarField` ×2, validated with `isValidRange`), a subjects multi-select + an "All classes" checkbox (sets `all_classes`, disables the multi-select), reason `<select>`, explanation `<textarea maxLength=500>` with a live counter, and a file input accepting up to 3 files validated by `validateFile` with a per-file **indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)** and inline type/size errors. Byte-percent progress is explicitly out of scope because `@supabase/storage-js` 2.45.4 `upload()` is `fetch()`-based and its `FileOptions` has no progress callback. Shows the fixed notice "Attachments are visible only to you and class officers." (FR-4.10). Submits via `createAbsenceRequest` + uploads.
- `src/components/MyAbsenceList.tsx` — member "My requests" with status badges (text + icon + token, not color-only) and officer remarks; delete button shown only while `pending` (FR-4.7/4.11).
- `src/components/OfficerAbsenceInbox.tsx` — all requests with filters: status `<select>`, date-range (`rangeOverlaps`), subject `<select>`, student-name text search (all client-side over the already-authorized rows). **Subject-filter semantics (explicit):** a request matches a subject filter `S` iff `all_classes` is `true` **OR** `subject_ids` contains `S` — i.e. an "All classes" request matches *every* subject filter. **Student-name filter** matches case-insensitively against the `studentName` resolved from the disambiguated embed `student:profiles!absence_requests_user_id_fkey(name)` (see `useAbsenceRequests`). Each row opens attachments via `signedUrlFor('excuse-attachments', path)` with the default (inline) disposition, opened in a new tab for preview, plus an optional "Save a copy" that re-mints with `{ download: file_name }`; and offers a status `<select>` + remark `<textarea>` saved via `updateAbsenceStatus` (FR-4.8). After a status change it triggers the pending-count refetch (FR-4.9). **Scale assumption (NIT7):** the inbox assumes a class-scale request volume and fetches **all** rows ordered by `created_at desc`, filtering client-side; pagination is out of scope for the initial build, and if volume grows the status/date filters should move server-side.
- `src/components/StatusBadge.tsx` — shared status pill (pending/acknowledged/needs_followup) with icon + token + text.

### Reviewers
- `src/components/ReviewersPage.tsx` — gated; loading/empty/error states; the upload entry (opens `ReviewerUploadDialog` in `Modal`) available to any signed-in user.
- `src/components/ReviewerUploadDialog.tsx` — title (required), subject `<select>` (required), optional description, single file validated by `validateFile(REVIEWER_MIME, REVIEWER_MAX)` with an **indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)**; submits via `createReviewer` + upload. Byte-percent progress is explicitly out of scope because `@supabase/storage-js` 2.45.4 `upload()` is `fetch()`-based and its `FileOptions` has no progress callback.
- `src/components/ReviewerCard.tsx` + `ReviewerGrid.tsx` — a responsive card grid: title, subject, uploader name (resolved from `profiles`), upload date, **file-type icon** + human size, and a Download button that calls `signedUrlFor('reviewers', path, { download: file_name })` and navigates to the returned URL (Storage sets `Content-Disposition: attachment; filename=<file_name>`, so the save is forced with the correct name even though the URL is cross-origin — see OD-5; the anchor `download` attribute is **not** relied upon). Filter by subject `<select>`, search by title (text), sort by newest (FR-5.7). Empty state + a `Modal` confirm dialog before delete (shown for owner or officer; RLS is the real gate) (FR-5.8).

---

## New theme tokens (name · light · dark · pairing) — all AA-guarded

New tokens are added **only** to the `html[data-mode='dark']` and `html[data-mode='light']` blocks in `src/styles/tokens.css`. They are **not** added to `theme-core.ts` `resolveTokens`, and `resolveTokens` is **not** modified. Rationale: `resolveTokens` returns a fixed, closed `TokenMap` of the base/derived, user-themable tokens (accent, bg/surface tints, their AA-corrected contrasts), and the runtime bootstrap writes exactly those keys inline on `<html>`. The new event/status/assessment tokens are **fixed per-mode constants** (not user-themable and not derived from the accent — the same category as `--danger`/`--danger-contrast`, which also live only in `tokens.css`). Adding them to `resolveTokens` would be dead weight: nothing recomputes them, so the earlier "runtime theming keeps them in sync" rationale was wrong and is dropped. Each color token used as a **foreground** is paired with an **icon** so meaning is never color-only; chip/badge **backgrounds** carry text/icon in a readable on-color.

Event-type tokens (chip background + its readable foreground), each with the icon from `EventBadge`:

| Token | Light | Dark | Paired icon |
| --- | --- | --- | --- |
| `--ev-school` / `--ev-school-fg` | `#2563EB` / `#FFFFFF` | `#8FB4FF` / `#0E1726` | calendar-star |
| `--ev-quiz` / `--ev-quiz-fg` | `#0E7A5F` / `#FFFFFF` | `#6FE3C0` / `#0E1726` | clipboard-question |
| `--ev-exam` / `--ev-exam-fg` | `#B4232A` / `#FFFFFF` | `#FF9AA0` / `#1A0A0B` | document-check |
| `--ev-pres` / `--ev-pres-fg` | `#7A3DB8` / `#FFFFFF` | `#D3A6F2` / `#0E1726` | presentation-screen |

Status / tracker / assessment tokens:

| Token | Light | Dark | Pairing |
| --- | --- | --- | --- |
| `--status-pending` / `-fg` | `#8A5A00` / `#FFFFFF` | `#FFD08A` / `#0E1726` | hourglass icon + "Pending" text |
| `--status-ack` / `-fg` | `#0E7A5F` / `#FFFFFF` | `#6FE3C0` / `#0E1726` | check icon + "Acknowledged" |
| `--status-followup` / `-fg` | `#B4232A` / `#FFFFFF` | `#FF9AA0` / `#1A0A0B` | alert icon + "Needs follow-up" |
| `--task-done` (dim fg) | `#5B6881` | `#9AA8BF` | checkbox state + line-through + sr-only "(done)" |
| `--assess-badge` / `-fg` | `#B4232A` / `#FFFFFF` | `#FF9AA0` / `#1A0A0B` | small triangle/exclamation marker + sr-only "(assessment within 7 days)"; shape distinct from the round pending dot |

The exact hex values above are **starting candidates**; the authoritative gate is the AA harness (below), which the implementer runs to confirm or nudge each value. `--task-done` deliberately equals the existing `--muted` value in each mode (`#5B6881` light, `#9AA8BF` dark — verified against `tokens.css`), which `palette-aa.test.ts` already proves is AA on `--surface`/`--bg`; defining `--task-done` as its own token keeps the semantics explicit, and it is still included in the new harness table below for completeness.

### Extending the AA/contrast harness (NFR-1, AC 14)

Add `src/lib/palette-ext-aa.test.ts` in the style of `palette-aa.test.ts`, but importing **only** `contrastRatio` and `AA_NORMAL` from `theme-core.ts`. It must **not** import `DARK_BASE`/`LIGHT_BASE`/`resolveTokens`: those structures are the closed base-token map and do **not** contain the new chip/badge tokens, so importing them would not let the test see the new pairs. Because the new tokens are fixed per-mode constants defined in `tokens.css`, the test asserts over a **literal in-file table of `{ token, bg, fg }` hex triples** that mirrors the exact values written into the two `tokens.css` mode blocks (dark and light). This literal table is the single source the test checks; the design flags that the hex values in the table below and the hex values in `tokens.css` must be kept identical (a one-line comment in both points at the other).

For each triple (per mode) it asserts:
- every chip/badge **foreground** hex (`--ev-*-fg`, `--status-*-fg`, `--assess-badge-fg`) clears `AA_NORMAL` against its **own** background hex (`--ev-*`, `--status-*`, `--assess-badge`): `expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL)`;
- `--task-done` clears `AA_NORMAL` against the `--surface` and `--bg` hex of that mode (it is readable text, not decoration) — the two surface/bg hex values are included in the literal table for each mode;
- the badge **background** tokens are documented as used only as backgrounds (never as text on `--surface`), so only the fg-on-bg pair is asserted.

Shape mirrors `palette-aa.test.ts`'s `cases` array but each case is a concrete `{ mode, token, bg, fg }` with literal hex, not a `BasePalette`. Because these are fixed per-mode constants (not user-themable, like `--danger`), this single computed test fully guards them; there is no runtime recomputation to also test.

---

## Error handling (concrete, per fallible operation)

- **Any mutation (events, completions, absences, reviewers):** reuse `classify()` → `MutationResult`. A `42xxx`/RLS message → `denied` ("Only officers can do that" for events; for own-row operations a denial is unexpected and maps to the generic "Couldn't save, try again"). Everything else → `network` ("Couldn't save, try again"). Recoverable; surfaced inline via `role="alert"`; not logged beyond the console (consistent with the app's no-telemetry stance). No local state change on error (except the optimistic completion toggle, which **reverts** on error).
- **Optimistic completion toggle (FR-2.8):** on mutation failure, revert the local `completedTaskIds` change and show an inline message; realtime reconcile corrects any drift. Reconcile is **idempotent on the `Set`** (add/remove keyed by `taskId`), so the optimistic update and the client's own INSERT/DELETE self-echo converge regardless of arrival order, and revert-on-error simply removes/re-adds the single `taskId` — no sequence number is needed even though the table PK is `(user_id, task_id)` (NIT6). Recoverable, non-fatal.
- **File upload (absences/reviewers):** client-side `validateFile` rejects wrong type/oversize **before** upload with a specific inline message ("PDF, JPG or PNG only" / "Max 5 MB"); the storage bucket's allowed-MIME/size config is the server backstop (FR-4.P5/5.2, AC 8) and a storage rejection surfaces as a `network`-class inline error. During the in-flight upload the UI shows an **indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)**, not a percentage bar: byte-percent progress is explicitly out of scope because `@supabase/storage-js` 2.45.4 `upload()` is `fetch()`-based and its `FileOptions` exposes no progress callback — this is the chosen mechanism (lowest risk, no new dependency, and it keeps the `ea_insert` own-folder/pending `WITH CHECK` path intact; `createSignedUploadUrl` + XHR is explicitly not used). A partial failure during a multi-file absence submit leaves the request `pending` (deletable by the member) and reports which file failed. Recoverable.
- **Signed-URL mint (`signedUrlFor`):** a denied mint (guessed/forbidden path, or anon) → inline "You don't have access to this file" on that row; a transient failure → "Couldn't open the file, try again". Never exposes the path or a partial URL. Recoverable, per-row.
- **Reads (hooks):** reuse the existing `status: 'loading' | 'ready' | 'error'` + `retry` contract; `error` renders the page's error state with a Retry button (NFR-4). Absence/reviewer reads that return zero rows render the empty state, not an error.
- **Config missing (`supabase == null`):** inherits the existing `ConfigError` short-circuit; mutations return `not-configured`.

### Input validation rules (per external input)

- **Add Event:** `type` required (enum-constrained in DB); `title` required, trimmed 1–200 (client) — DB `not null`; `subject_id` optional; `event_date` required (DB `not null`); `start_time`/`end_time` optional and treated as a pair — an `end_time` may only be set when a `start_time` is present, and then `end >= start` (client enforces the pairing + ordering; DB CHECK `events_time_order` is the backstop and rejects a bare end); `location`/`notes` optional, capped client-side (e.g. 200/2000) for UX, and the form sends `''` (**not** `null`) for an empty value because both columns are `not null default ''` — sending `null` would hit a not-null violation (NIT5). `subject_id` is optional at the DB level for **all** event types; the "non-school events should have a subject" expectation is **UI guidance only** (a hint in the dialog), **not** a DB constraint, so that gap is intentional (NIT5). Failure → disabled submit + inline hint.
- **Absence request:** `date_from`/`date_to` required, `to >= from` (client `isValidRange` + DB CHECK `absence_date_range`); scope: at least one subject **or** `all_classes` (client + DB CHECK `absence_scope`); `reason_category` required enum; `explanation` ≤ 500 (client counter + DB CHECK `absence_explanation_len`); attachments 0–3, each type ∈ allowed + size ≤ 5 MB (client `validateFile` + bucket config + DB CHECK on `absence_attachments`). Failure → inline per-field.
- **Reviewer:** `title` required; `subject_id` required enum-of-subjects; `description` optional; exactly one file, type ∈ 5 allowed + ≤ 20 MB (client + bucket + DB CHECK). Failure → inline per-field.
- **All user text** is sent as parameterized values through the Supabase client (no string-built SQL); file names are run through `sanitizeFileName` before becoming part of a storage path.

### Invariant ownership

- **"Only officers write events / tasks":** owned by the DB (`events_write`/`tasks_write` `is_officer()` policies). UI hiding is convenience only (AC 1). Chosen at the DB because it is the sole trusted boundary.
- **"A completion is self-only; class `tasks.status` is untouched":** owned by the DB — `task_completions` is a separate table with own-row policies and there is no code path from the checkbox to `tasks.status` (FR-2.2, AC 3).
- **"A member reads only their own absence request/attachment":** owned by the DB (`ar_select`/`aa_select` row-dependent policies + no anon grant + storage own-folder policies). This is the privacy-critical invariant and is enforced at the lowest layer, in one place per table (AC 7, FR-4.P6).
- **"Edit/delete only while pending":** owned by the DB (`ar_update_member`/`ar_delete_member` USING/WITH CHECK), UI hides as convenience (AC 9).
- **"Glow / upcoming badge / month grid":** owned by `src/lib` pure functions, derived from live data, never stored (FR-2.9/1.10/3.8) — enforced by unit tests.

---

## Testability

- **Unit (Vitest, jsdom-free where pure):** every `src/lib` function above (`subjectGlows`, `hasUpcomingAssessment` + `addDaysYMD`, `buildMonthGrid`/`bucketItemsByDay`/`visibleWithOverflow`, `validateFile`/`buildStoragePath`/`sanitizeFileName`, `isValidRange`/`rangeOverlaps`) is pure and directly unit-testable with no mocks — matching `derive.test.ts`. The new AA harness (`palette-ext-aa.test.ts`) is pure computation over the fixed token values.
- **Integration (live Supabase, `src/__tests__/rls.integration.test.ts` style, skip-with-reason when env absent):** add cases for every new table and acceptance criterion — anon denied read/write on `task_completions`/absences/`reviewers`; member denied event write; officer event write ok; member completion insert/delete own-row ok and cross-user denied; member reads own absence, a *second* member denied that request **and** its attachment and a guessed storage path, officer reads both (AC 7); member edit/delete blocked once not `pending` (AC 9); **member cannot insert an attachment storage object under another member's folder, under a non-existent `{request_id}`, or under their own but *acknowledged* request's folder** (verifies the `ea_insert` EXISTS gate, cycle-2 finding #1) while an upload under a still-`pending` own request succeeds; **member cannot delete the attachment table row *or* the storage object once the parent request is not `pending`** (verifies the mirrored `aa_delete` + `ea_delete_own` pending gate) while deletion of a still-`pending` request's attachment succeeds; any authenticated reviewer download ok, anon denied, non-owner delete denied except officer (AC 11/12); pending-count query (AC 10). New env: a second member and a seeded request/attachment id (documented in SETUP.md §7).
- **Storage (manual, in SETUP.md):** verify wrong-type/oversize upload is rejected by the bucket config (AC 8) and that a signed URL expires after 60 s.
- **A11y/theme pass (manual + the AA harness):** keyboard traversal of Nav, calendar cells, forms, and the delete confirm `Modal` (focus trap already provided by `Modal`); `aria-current` on nav; `sr-only` labels for completion, status, and assessment badges; light/dark render check — the AA harness is the automated backbone (AC 14).
- **Hooks:** the realtime hooks are thin wrappers over the already-tested `useRealtimeTable`; the new composite-key variant (`useRealtimeTableKeyed`) gets a focused test for key-based INSERT/UPDATE/DELETE reconcile. `useTaskCompletions` additionally gets a **session-transition test**: starting signed-out (`completedTaskIds` empty, no subscription), signing in triggers a fetch + subscribe that populates the set, and signing out tears down the subscription and **resets the set to empty** (so `subjectGlows` reverts to the signed-out rule); a user change re-keys to the new user's rows. Mutations trust RLS and are covered end-to-end by the integration suite rather than mocked.

---

## SETUP.md updates (NFR-7)

Add a new section documenting: (1) applying `0003` (what it creates); (2) the two **manual bucket** steps from OD-6 with exact allowed-MIME lists and size limits, and the private/public flags; (3) the new RLS integration env vars (second member, seeded absence request/attachment ids); (4) a note that **no events or reviewers are seeded**; (5) the 60 s signed-URL expiry and the "attachments visible only to you and officers" privacy posture. The existing replica-identity contract note is referenced to explain the `replica identity full` on `task_completions`.

---

## Build order (unchanged from requirements, mapped to artifacts)

1. `0003_classboard_ext.sql` + SETUP.md bucket steps.
2. Events: `useEvents`, `addEvent`/`updateEvent`/`removeEvent`, `AddEventDialog`, `EventBadge`, `TaskList` + `ScheduleCell` integration, event tokens + AA harness entries.
3. Personal tracker: `useTaskCompletions` (+ `useRealtimeTableKeyed`), optimistic `markTaskDone`/`unmarkTaskDone`, `TaskRow` checkbox + list filter, `subjectGlows` swap, `--task-done`.
4. Month calendar: `calendar.ts`, `MonthCalendar`, `BoardViewToggle`, `DetailsPanel` day-items, responsive dots.
5. Absences: `NavProvider`/`Nav`/`PageRouter`/`SignInGate`/`AccountControls` (extracted from `Header`), `AbsencesPage`, `AbsenceForm`, `MyAbsenceList`, `OfficerAbsenceInbox`, `StatusBadge`, `useAbsenceRequests`/`useAbsencePendingCount`, mutations, `signedUrlFor`, storage policies exercised.
6. Reviewers: `ReviewersPage`, `ReviewerUploadDialog`, `ReviewerCard`/`ReviewerGrid`, `useReviewers`, `createReviewer`/`deleteReviewer`.
7. RLS integration pass for anon/member/officer across all new tables; a11y + theme (AA harness) pass.
```

---

## Review responses — cycle 2 (against the current `design-verdict.json` / `design-review.md`)

The current verdict is `CHANGES_REQUESTED` with 0 HIGH, 3 MEDIUM (#1–#3), and 4 NIT (#4–#7). Every MEDIUM and every NIT is addressed in-place above; all choices stay consistent with the original requirements (RLS as the sole authorization boundary, privacy of medical-certificate attachments, token-driven theming at WCAG AA, pure-function derivation). None of the locked decisions (RLS/storage policy model, `is_officer()` reuse, `0003`-only migration, realtime/replica-identity choices) is changed; only wording/specification is tightened.

- **#1 HIGH — "Upload progress" promised (FR-4.3/FR-5.2) but not feasible via the SDK `upload()` path in `@supabase/storage-js` 2.45.4.** ADDRESSED (option (a), reframe to indeterminate). `AbsenceForm` and `ReviewerUploadDialog` now specify a **per-file indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)** rather than a percentage bar, and both state explicitly that **byte-percent progress is out of scope** because `@supabase/storage-js` 2.45.4 `upload()` is `fetch()`-based and its `FileOptions` exposes no progress callback. The Error-handling → File-upload bullet names this as the **chosen mechanism** (lowest risk, no new dependency, leaves the `ea_insert` own-folder/pending `WITH CHECK` path intact) and records that `createSignedUploadUrl` + XHR is explicitly **not** used. (See OD-5, Error handling → File upload, `AbsenceForm`, `ReviewerUploadDialog`.)
- **#2 MEDIUM — `profiles` embeds on privacy pages must select `name` only; `profiles_read` is `using(true)` and also exposes `email`.** ADDRESSED. A mandatory **Profiles-embed rule** is added at the top of the Data-layer section: every `profiles` embed on the Absences and Reviewers pages selects **`name` only** — `student:profiles!absence_requests_user_id_fkey(name)` for the officer inbox and `uploader:profiles!..._fkey(name)` for reviewer cards — **never** `profiles(*)` and **never** `email`, so a student's email is never surfaced next to medical-adjacent data. The rule names `profiles_read`'s `using(true)`/email exposure as the reason. (See Data layer → Profiles-embed rule; `useAbsenceRequests`; `ReviewerCard`.)
- **#3 MEDIUM — per-role Realtime delivery outcome not stated for every published table (`reviewers` / `task_completions` anon case).** ADDRESSED. OD-4 now carries a **"Per-role delivery outcome for every published table"** block stating the anon outcome for each: `events` → anon **receives changes** (public, intended); `task_completions` → anon has no grant/policy and **receives nothing** (only the owning authenticated subscriber gets rows); `reviewers` → anon has no grant/policy and **receives nothing** (only authenticated subscribers get rows); the absence tables are not published, so no subscriber of any role receives streamed changes. (See OD-4.)
- **#4 NIT — DB size CHECK and bucket `file_size_limit` are two server limits that can drift; CHECK validates self-reported `size_bytes`.** ADDRESSED. A **"Size-limit coupling (NIT4)"** note is added after the table shapes: the DB `attach_size`/`reviewer_size` CHECKs and the bucket `file_size_limit` **must be kept in lockstep** (a comment in each cross-references the other), and the **bucket `file_size_limit` is the authoritative byte cap** while the DB CHECK validates only the client-supplied `size_bytes` *metadata*. (See `0003` tables → Size-limit coupling.)
- **#5 NIT — `events.location`/`notes` modeled `not null default ''` vs "optional"; non-school subject requirement is UI-only and unstated.** ADDRESSED. The Add-Event input-validation rule now states the form sends `''` (**not** `null`) for empty `location`/`notes` (both columns are `not null default ''`, so `null` would violate), and that `subject_id` is **optional at the DB level for all event types** — the "non-school events should have a subject" expectation is **UI guidance only**, not a DB constraint, so the gap is intentional. (See Input validation rules → Add Event.)
- **#6 NIT — optimistic completion toggle vs. self-echo Realtime reconcile ordering under-specified.** ADDRESSED. The Error-handling → optimistic-toggle bullet now states the reconcile is **idempotent on the `Set`** (add/remove keyed by `taskId`), so the optimistic update and the client's own INSERT/DELETE self-echo **converge regardless of arrival order**, and revert-on-error simply removes/re-adds the single `taskId` — **no sequence number is needed** even though the table PK is `(user_id, task_id)`. (See Error handling → optimistic completion toggle.)
- **#7 NIT — officer inbox fetches all requests and filters client-side with no stated bound or pagination.** ADDRESSED. `OfficerAbsenceInbox` now carries an explicit **scale assumption**: the inbox assumes **class-scale** request volume, fetches **all** rows ordered by `created_at desc`, and filters client-side; **pagination is out of scope** for the initial build, and the status/date filters move server-side if volume grows. (See `OfficerAbsenceInbox`.)

---

## Review responses — cycle 1 (historical, against the prior review)

Every blocking (HIGH/MEDIUM) finding was addressed in-place above; the NITs were also resolved. Each choice is consistent with the original requirements (RLS-as-sole-boundary, privacy of medical certificates, token-driven theming, pure-function derivation).

- **#1 HIGH — `absence_scope` CHECK passes on NULL for an empty scope.** ADDRESSED. The constraint is now `check (all_classes or cardinality(subject_ids) >= 1)` (`cardinality('{}')` = 0, not NULL, so the CHECK evaluates to FALSE and rejects an unscoped request). The OD-2 prose was corrected and now explicitly warns against the `array_length(..., 1)` form and its NULL semantics. This closes the FR-4.2 gap and keeps the DB CHECK as the real backstop.
- **#2 MEDIUM — storage DELETE for `excuse-attachments` not gated on request status.** ADDRESSED. `ea_delete_own` now carries an `EXISTS` subquery on `public.absence_requests` matching the `{request_id}` path segment (`(storage.foldername(name))[2]`), requiring the parent to be owned by the caller **and** still `pending` — mirroring the table-level `aa_delete` rule so a certificate file cannot be deleted after acknowledgement and rows are never orphaned. The OD-6 storage summary and the integration test plan were updated to assert this.
- **#3 MEDIUM — anchor `download` attribute won't force a cross-origin save.** ADDRESSED. Verified against the installed `@supabase/storage-js` (`createSignedUrl(path, expiresIn, { download?: string | boolean })`) that the SDK sets `Content-Disposition: attachment; filename=<name>` server-side. Reviewers now mint with `{ download: file_name }` and navigate to the URL (no reliance on the anchor `download` attribute); excuse attachments mint inline (default) for preview with an optional "Save a copy" using `{ download: file_name }`. `signedUrlFor` gained a `download` option. The blob-fetch workaround is documented only as a fallback.
- **#4 MEDIUM — `tokens.css` vs `resolveTokens` inconsistency; AA harness import.** ADDRESSED. New tokens live **only** in `tokens.css` (both mode blocks); `resolveTokens` is explicitly left untouched (the misleading "kept in sync at runtime" rationale is removed, noting these are fixed per-mode constants like `--danger`). `palette-ext-aa.test.ts` now imports **only** `contrastRatio` and `AA_NORMAL` and asserts over a literal `{ mode, token, bg, fg }` hex table kept identical to `tokens.css`, not over `DARK_BASE`/`LIGHT_BASE`.
- **#5 MEDIUM — officer inbox student-name data path unspecified.** ADDRESSED. `useAbsenceRequests` officer mode now fetches with an embedded relationship `.select('*, profiles(name)')` relying on the public `profiles_read` policy, maps it to `studentName`, and the inbox filters that string client-side. Noted that the member view does not need the embed.
- **#6 MEDIUM — subject-filter semantics over `uuid[]` unspecified.** ADDRESSED. Stated explicitly: a request matches subject filter `S` iff `all_classes` is `true` OR `subject_ids` contains `S`.
- **#7 NIT — `ar_insert` relies on client omitting status.** ADDRESSED. `createAbsenceRequest` is documented to never send `status`/`officer_remark`/`reviewed_by`/`reviewed_at`, so the WITH CHECK is always satisfied.
- **#8 NIT — reviewers MIME CHECK only in prose.** ADDRESSED. The explicit `constraint reviewer_mime check (mime_type in (...five types...))` is now written into the `public.reviewers` migration block.
- **#9 NIT — Header "reuse the right-hand cluster" overstates.** ADDRESSED. Reworded to an extraction/refactor: a new `src/components/AccountControls.tsx` is pulled out of the currently-inline `Header` and composed by both `Header` and `Nav`; the controls to move are listed. Build order updated.
