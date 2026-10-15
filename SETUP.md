# Setup — Class To-Do Board

This app is a React + TypeScript + Vite single-page app backed by Supabase
(Postgres + Auth + Realtime). Anonymous visitors get full read access to the
schedule, subject details, and task list. Only authenticated **Officers** can
write tasks/subjects — enforced server-side by Row-Level Security (RLS), never
by the UI.

## 1. Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project values:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

- Find both under **Project Settings -> API** in the Supabase dashboard.
- The `anon` key is a **public** client credential by design. RLS — not key
  secrecy — enforces authorization, so shipping it in the SPA is expected and
  safe. The **service-role** key must never reach the client; it is used nowhere
  in this app.
- `.env` is gitignored; `.env.example` is committed with placeholders only.
- If the env vars are missing or the URL is not a valid `http(s)` URL, the app
  renders a **Configure Supabase** screen instead of crashing.

Optional:

```
VITE_REALTIME_FALLBACK=1
```

Set to `1` to force the data hooks to poll (`select *` every 15s) instead of
using Realtime. Use this only if anon Realtime delivery proves unreliable on
your project (see the verification step below). Glow/list correctness is
identical either way because derivation does not depend on the transport.

## 2. Apply the database schema

Run `supabase/migrations/0001_init.sql` against your project — paste it into the
Supabase **SQL editor** and run it, or apply it with the Supabase CLI
(`supabase db push` after linking the project). It creates:

- enums `user_role` and `task_status`;
- tables `profiles`, `subjects`, `schedule_slots`, `tasks`;
- `is_officer()`, `current_role_of(uid)`, `handle_new_user()` + the
  `on_auth_user_created` trigger;
- RLS policies: public read for everyone, officer-only writes;
- the Realtime publication for the three data tables.

The migration seeds **no** data — add subjects, schedule slots, and tasks
yourself (via the app as an Officer, or directly in Supabase).

## 2a. Apply the extension schema (0003 + 0004) and create the storage bucket

The extension adds events, a per-account task tracker, absences (with an
optional evidence link), and reviewers (shared study files). Only reviewers now
stores files in Supabase Storage. The `reviewers` bucket and its MIME/size limit
are a **manual** step (buckets live in `storage.buckets` and are configured
through the dashboard or Storage API, not hand-inserted); the `storage.objects`
RLS policies are in the migration. **Create the bucket before applying 0003** so
the policies and the first uploads have their bucket in place.

> **Absences no longer use file attachments.** `0004` removes the
> `excuse-attachments` subsystem and replaces it with a single optional
> `evidence_url` column on `absence_requests` (any URL, e.g. a Google Drive share
> link), visible under the same owner-or-officer rule the request already uses.
> If you are setting up a fresh project you do **not** need the
> `excuse-attachments` bucket at all; if you applied `0003` previously, delete
> that bucket from the dashboard after applying `0004` (see Step 4 below).

### Step 1 — create the PRIVATE `reviewers` storage bucket

In the dashboard under **Storage -> Buckets -> New bucket** (or via the CLI/API),
create it with **public = off**:

| Bucket | Public | Allowed MIME types | File size limit |
| --- | --- | --- | --- |
| `reviewers` | off | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `image/jpeg`, `image/png` | `20 MB` |

> **Keep the bucket limit in lockstep with the DB CHECK.** `0003` also enforces
> MIME and size via the `reviewer_mime`/`reviewer_size` (20 MB) CHECK
> constraints. The **bucket `file_size_limit` is the authoritative byte cap** (it
> rejects the actual uploaded bytes); the DB CHECK validates only the
> client-supplied `size_bytes` metadata on the row. A dashboard-only change to
> the bucket limit would silently diverge from the CHECK, so change both
> together.

### Step 2 — apply `supabase/migrations/0003_classboard_ext.sql`

Paste it into the SQL editor and run it (or `supabase db push`). It creates:

- enums `event_type`, `absence_reason`, `absence_status`;
- tables `events`, `task_completions`, `absence_requests`,
  `absence_attachments`, `reviewers` (with the MIME/size/date-range/scope/time
  CHECK constraints). **Note:** `0004` later drops `absence_attachments`; on a
  fresh setup it is created by `0003` and immediately removed by `0004`.
- RLS on all five tables, with explicit `GRANT`s (no `anon` grant on
  `task_completions`, the absence tables, or `reviewers`) and named policies for
  `anon`/`authenticated`;
- the four `excuse-attachments` and three `reviewers` policies on
  `storage.objects` (the four `excuse-attachments` policies are dropped by
  `0004`);
- the Realtime publication add for `events`, `task_completions`, `reviewers`,
  and `alter table public.task_completions replica identity full`.

It reuses the existing `public.is_officer()` helper and does **not** modify
`0001_init.sql` or `0002_deadline_timestamptz.sql`. It seeds **no** data — no
events and no reviewers are inserted; add those through the app.

### Step 3 — apply `supabase/migrations/0004_absence_evidence_url.sql`

This is the forward migration for the absence **evidence link** change. Paste it
into the SQL editor and run it (or `supabase db push`). It:

- adds a nullable `evidence_url text` column to `absence_requests` (with a
  permissive `http(s)` CHECK backstop);
- drops the four `excuse-attachments` `storage.objects` policies and the
  `absence_attachments` table (CASCADE removes its policies/grants).

It does **not** touch events, task_completions, reviewers, the `ar_*` policies,
the realtime publication, or `0001`/`0002`/`0003` (which stay byte-for-byte
unchanged). **Applying `0004` is the only DB step for the evidence-link change.**

### Step 3a — apply `supabase/migrations/0005_announcements.sql`

This is the forward migration for the **Announcements board**. Paste it into the
SQL editor and run it (or `supabase db push`). It:

- creates `public.announcements` (`id`, `title`, `body`, `created_by`,
  `created_at`) — a **text-only** table, so **no storage bucket is needed**;
- grants `select` to **anon + authenticated** (public read) and `insert`/
  `delete` to `authenticated` only — there is **no update grant** and **no
  update policy** (editing an announcement is out of scope, mirroring
  `reviewers`);
- adds the `announcements_read` (public), `announcements_insert`, and
  `announcements_delete` policies, with insert/delete gated to officers via the
  reused `public.is_officer()`;
- adds `announcements` to the `supabase_realtime` publication. The SELECT policy
  is row-independent (`using(true)`), so the **default** replica identity is
  sufficient — **no `replica identity full`** is set.

It does **not** touch any `0001`–`0004` object.

### Step 3b — apply `supabase/migrations/0006_event_completions.sql`

This is the forward migration for the **per-account event tracker** ("mark an
event done for me"). Paste it into the SQL editor and run it (or
`supabase db push`). It mirrors `task_completions` from `0003` exactly. It:

- creates `public.event_completions` (`user_id`, `event_id`, `completed_at`)
  with a **composite primary key** `(user_id, event_id)` and no single `id`
  column — a **text-only** table, so **no storage bucket is needed**;
- grants `select`/`insert`/`delete` to `authenticated` **only** — there is
  **no anon grant**, **no update grant**, and **no update policy** (completion
  is a toggle expressed as insert/delete);
- adds the own-rows-only `ec_select`/`ec_insert`/`ec_delete` policies, each
  gated on `user_id = auth.uid()`;
- adds `event_completions` to the `supabase_realtime` publication. Its SELECT
  policy is **row-dependent** (`user_id = auth.uid()`), so it sets
  `alter table public.event_completions replica identity full` per the
  replica-identity contract (same treatment as `task_completions`).

It does **not** touch any `0001`–`0005` object or change class-wide event state.

### Step 4 — privacy posture, signed URLs, and the evidence link

- The `reviewers` bucket is private. Downloads are served only through
  **short-lived signed URLs** (TTL **60 s**) minted on demand per click — never
  public URLs. Reviewers are stored under `{uploader_id}/{reviewer_id}/filename`;
  any signed-in user may download, anon cannot (no anon storage policy).
- Absences carry an optional `evidence_url` on the request row (any URL, e.g. a
  Google Drive share link). It is **not** a file upload and uses no bucket; its
  visibility follows the request's own `ar_select` policy — readable by the
  **owner and class officers only**, never by another member or anon. The form
  shows the notice "Your evidence link is visible only to you and class
  officers."
- **Delete the `excuse-attachments` bucket** from the dashboard (Storage ->
  Buckets) once `0004` is applied. Bucket rows are managed outside SQL, so the
  migration cannot remove it. The `reviewers` bucket must be left intact.

### Step 5 — confirm anon has no bucket access

No `anon` storage policy is created for the `reviewers` bucket, so an anonymous
visitor cannot mint a signed URL or read any object. Confirm by attempting an
anonymous `createSignedUrl` against the bucket — it must be denied.

### Replica-identity note (task_completions)

`task_completions` is published and its SELECT policy is **row-dependent**
(`user_id = auth.uid()`), so `0003` sets `replica identity full` on it per the
replica-identity contract in section 5 and `0001`. The other two published
tables (`events`, `reviewers`) have row-independent SELECT policies and keep the
default identity.

## 3. Google OAuth (optional sign-in method)

Email/password works out of the box. To enable Google login:

1. In the Supabase dashboard, go to **Authentication -> Providers -> Google** and
   enable it.
2. Create an OAuth client in the Google Cloud console (type: Web application).
3. Set the authorized redirect URI to the value Supabase shows on the Google
   provider page (`https://<project-ref>.supabase.co/auth/v1/callback`).
4. Paste the Google client ID and secret into the Supabase Google provider
   settings and save.
5. Add your app's origin (e.g. `http://localhost:5173` and your production URL)
   to **Authentication -> URL Configuration -> Redirect URLs**.

The client is created with `detectSessionInUrl: true`, which completes the OAuth
redirect back into the app automatically.

## 4. Bootstrap the first Officer

Every new user is created as a `member`. Promote the first Officer by email with
direct DB access (SQL editor), because there is no Officer yet to use the admin
UI:

```sql
update public.profiles
set role = 'officer'
where email = 'you@example.com';
```

After that, Officers can promote/demote others from the in-app admin panel.
Recovery: this same statement restores write access if a lone Officer ever
demotes themselves.

## 5. Realtime enablement & anon-Realtime verification

The migration already runs:

```sql
alter publication supabase_realtime
  add table public.subjects, public.schedule_slots, public.tasks;
```

Verify anonymous Realtime delivery (acceptance criterion: adding a task makes the
subject glow "for everyone", including signed-out viewers):

1. Open the app in a browser **without signing in**.
2. In a second session, sign in as an Officer and **INSERT** a task for a
   subject. Confirm the anon browser receives the `postgres_changes` event and
   the subject starts glowing with no reload.
3. As the Officer, toggle that task to `done` (**UPDATE**) and confirm the anon
   client stops glowing when the last pending task is cleared.
4. As the Officer, **DELETE** a task and confirm the anon client reflects it.

This exercises all three event types the glow logic relies on. They work under
the **default replica identity** because reconciliation keys only on the primary
key, which is always present (`new` for INSERT/UPDATE, `old` for DELETE).

One-line replica-identity check (expect `d` = default, which is sufficient):

```sql
select relname, relreplident
from pg_class
where relname in ('subjects', 'schedule_slots', 'tasks');
```

If anon Realtime does not deliver on your Supabase version, set
`VITE_REALTIME_FALLBACK=1` to switch to polling.

> **Replica-identity contract:** reconciliation reads only the PK. Current
> SELECT policies are `using(true)`, so delivery never depends on a column that
> might be absent from an `old` payload. **If you ever add a row-dependent SELECT
> policy** (anything other than `using(true)`) to a published table, add
> `alter table public.<t> replica identity full;` for that table.

## 6. `current_role_of()` coupling (do not drop this function)

`profiles_update_self`'s `WITH CHECK` calls `current_role_of(auth.uid())` on
**every** self-update — not only role changes. That means each logged-in user's
**theme-preferences save** and name edit also evaluate it. This is correct and
cheap (one indexed-PK `SELECT`), but it means the function is load-bearing:
dropping or renaming `current_role_of` independently would silently break
ordinary theme persistence and self name edits, not just role freezing. Keep it
in place alongside the policies.

## 7. RLS / role-escalation proof

RLS is the real authorization boundary — the UI only hides controls as a
convenience. The cases below prove it. They run **automatically** as an
integration suite when the test env is set (see "Automated run"); otherwise run
them **manually** with the snippets here.

### What is verified

| Case | Expected |
| --- | --- |
| Anonymous `SELECT` on `profiles`/`subjects`/`schedule_slots`/`tasks` | **allowed** |
| Anonymous `INSERT`/`UPDATE`/`DELETE` on `tasks` | **rejected** |
| Member `INSERT`/`UPDATE`/`DELETE` on `tasks` | **rejected** (`WITH CHECK is_officer()`) |
| Member `update({ name })` on own row | **allowed** (Policy A) |
| Member `update({ theme_preferences })` on own row | **allowed** (Policy A) |
| Member `update({ role: 'officer' })` on own row, **no other column** | **rejected** (pure self-escalation) |
| Member `update({ name, role: 'officer' })` on own row | **rejected** |
| Officer `update({ role })` on **another** user | **allowed** (Policy B) |
| Officer `update({ theme_preferences })` on **another** user | **rejected** (only the row owner, via Policy A, may write theme) |

The pure-escalation case (role-only, no other column changed) is the critical
negative: it fails `profiles_update_self`'s `WITH CHECK (role = current_role_of(auth.uid()))`
and, for a member, `profiles_update_officer`'s `WITH CHECK (is_officer())` too, so
it is rejected under the OR-composition of the two policies.

### Automated run

The suite is `src/__tests__/rls.integration.test.ts`. It is **skipped with a
printed reason** unless all of these env vars are set when you run `npm run test`:

```
RLS_TEST_SUPABASE_URL=https://<ref>.supabase.co
RLS_TEST_ANON_KEY=<anon-public-key>
RLS_TEST_MEMBER_EMAIL=<a seeded account whose role is 'member'>
RLS_TEST_MEMBER_PASSWORD=<...>
RLS_TEST_OFFICER_EMAIL=<a seeded account whose role is 'officer'>
RLS_TEST_OFFICER_PASSWORD=<...>
RLS_TEST_TARGET_PROFILE_ID=<a third profile id the officer may promote/demote
                            and whose theme the officer must not overwrite>
```

The extension (0003/0004) RLS cases need a **second member account** (to prove
one member cannot read another's absence request) and a seeded pending absence
request owned by the first member (ideally carrying an `evidence_url`):

```
RLS_TEST_MEMBER2_EMAIL=<a second seeded account whose role is 'member'>
RLS_TEST_MEMBER2_PASSWORD=<...>
RLS_TEST_ABSENCE_REQUEST_ID=<a pending absence_requests id owned by the first member>
```

Create the member/officer accounts via the app, promote one with the
officer-bootstrap SQL (section 4), pass a third profile id as the target, and —
for the extension cases — create a second member and seed one pending absence
request owned by the first member (optionally with an evidence link). The suite
restores any row it changes.

### Manual run (curl)

Set shell vars first (`anon` key, a member access token, an officer access
token — grab the user JWTs from `supabase.auth.getSession()` in the app console
after signing in, or from a `signInWithPassword` REST call):

```bash
BASE=https://<ref>.supabase.co/rest/v1
ANON=<anon-public-key>
MEMBER_JWT=<member access token>
OFFICER_JWT=<officer access token>
MEMBER_ID=<member profile id>
TARGET_ID=<another profile id>
```

Anonymous read (expect `200` + rows):

```bash
curl -s "$BASE/subjects?select=*" -H "apikey: $ANON"
```

Anonymous task insert (expect `401`/`403` — denied):

```bash
curl -s -X POST "$BASE/tasks" -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d '{"subject_id":"'$TARGET_ID'","title":"forged"}'
```

Member task insert (expect denied — `WITH CHECK is_officer()`):

```bash
curl -s -X POST "$BASE/tasks" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "Content-Type: application/json" \
  -d '{"subject_id":"'$TARGET_ID'","title":"forged"}'
```

Member self name / theme update (expect `2xx` — allowed):

```bash
curl -s -X PATCH "$BASE/profiles?id=eq.$MEMBER_ID" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "Content-Type: application/json" \
  -d '{"name":"New Name"}'
curl -s -X PATCH "$BASE/profiles?id=eq.$MEMBER_ID" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "Content-Type: application/json" \
  -d '{"theme_preferences":{"mode":"dark","accent":"#3366FF"}}'
```

Member pure role self-escalation, no other column (expect denied):

```bash
curl -s -X PATCH "$BASE/profiles?id=eq.$MEMBER_ID" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "Content-Type: application/json" \
  -d '{"role":"officer"}'
```

Officer promote/demote of another user (expect `2xx` — allowed, Policy B):

```bash
curl -s -X PATCH "$BASE/profiles?id=eq.$TARGET_ID" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT" -H "Content-Type: application/json" \
  -d '{"role":"officer"}'
```

Officer cross-user theme write (expect denied — only the owner may write theme):

```bash
curl -s -X PATCH "$BASE/profiles?id=eq.$TARGET_ID" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT" -H "Content-Type: application/json" \
  -d '{"theme_preferences":{"mode":"light","accent":"#FFFFFF"}}'
```

### Extension (0003) cases — manual curl

These mirror the automated extension suite
(`RLS extension boundary — 0003/0004 tables + storage`). Set the extra shell
vars first (grab the second member's JWT the same way as the others):

```bash
MEMBER2_JWT=<second member access token>
MEMBER2_ID=<second member profile id>
REQ_ID=<a pending absence_requests id owned by the first member>
STORAGE=https://<ref>.supabase.co/storage/v1
```

The private tables deny anon entirely (no grant/policy) — anon read is empty,
anon write is rejected:

```bash
# anon read task_completions / reviewers (expect [] — no rows, never data)
curl -s "$BASE/task_completions?select=*&limit=1" -H "apikey: $ANON"
curl -s "$BASE/reviewers?select=*&limit=1" -H "apikey: $ANON"
```

Member event insert rejected; officer event insert allowed (AC1/AC2):

```bash
curl -s -X POST "$BASE/events" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "Content-Type: application/json" \
  -d '{"type":"quiz","title":"forged","event_date":"2099-01-01"}'   # denied
curl -s -X POST "$BASE/events" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT" -H "Content-Type: application/json" \
  -d '{"type":"quiz","title":"ok","event_date":"2099-01-01"}'       # allowed
```

Member completion is self-only (AC3 — a cross-user `user_id` fails the WITH
CHECK; `tasks.status` is a different table and is never touched):

```bash
# own-row insert (expect 2xx)
curl -s -X POST "$BASE/task_completions" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "Content-Type: application/json" \
  -d '{"user_id":"'$MEMBER_ID'","task_id":"<any task id>"}'
# cross-user insert (expect denied)
curl -s -X POST "$BASE/task_completions" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "Content-Type: application/json" \
  -d '{"user_id":"'$MEMBER2_ID'","task_id":"<any task id>"}'
```

Absence privacy (AC7) — the second member cannot read the first member's
request (and therefore never sees its `evidence_url`); the owner and an officer
both read the row, `evidence_url` included:

```bash
# owner reads own request incl. evidence_url (expect the row); member2 (expect [])
curl -s "$BASE/absence_requests?id=eq.$REQ_ID&select=*,evidence_url" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT"
curl -s "$BASE/absence_requests?id=eq.$REQ_ID&select=*,evidence_url" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER2_JWT"            # expect []
# officer reads it too (owner-or-officer), evidence_url included
curl -s "$BASE/absence_requests?id=eq.$REQ_ID&select=*,evidence_url" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT"
```

Edit/delete only while pending (AC9) and the pending-count query (AC10):

```bash
# officer acknowledges, then restores to pending (re-runnable)
curl -s -X PATCH "$BASE/absence_requests?id=eq.$REQ_ID" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT" -H "Content-Type: application/json" \
  -d '{"status":"acknowledged"}'
curl -s -X PATCH "$BASE/absence_requests?id=eq.$REQ_ID" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT" -H "Content-Type: application/json" \
  -d '{"status":"pending"}'
# officer pending-count (exact; expect Content-Range to carry the count)
curl -s -I "$BASE/absence_requests?status=eq.pending&select=id" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT" -H "Prefer: count=exact"
```

Reviewers (AC11/AC12) — any signed-in user downloads; anon cannot; a non-owner
cannot delete another's reviewer, but an officer can:

```bash
# authenticated read (expect rows); anon read (expect [])
curl -s "$BASE/reviewers?select=*&limit=1" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT"
curl -s "$BASE/reviewers?select=*&limit=1" -H "apikey: $ANON"   # expect []
# first member (non-owner) deletes member2's reviewer (expect nothing deleted);
# officer deletes it (expect 2xx)
curl -s -X DELETE "$BASE/reviewers?id=eq.<member2 reviewer id>" -H "apikey: $ANON" \
  -H "Authorization: Bearer $MEMBER_JWT"
curl -s -X DELETE "$BASE/reviewers?id=eq.<member2 reviewer id>" -H "apikey: $ANON" \
  -H "Authorization: Bearer $OFFICER_JWT"
```

## Local development

```
npm install
npm run dev        # start the dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src
npm run test       # vitest run
npm run build      # tsc -b && vite build
```
