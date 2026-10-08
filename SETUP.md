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

## 7. RLS / role-escalation proof (manual verification)

> Filled in by FEAT-002 with concrete `curl`/API calls. Placeholder for now.

The checks to run against a live project (RLS is the real boundary):

- Anonymous `SELECT` works on all four tables.
- Anonymous and member `INSERT`/`UPDATE`/`DELETE` on `tasks` is **rejected**.
- A member's `update({ name, role: 'officer' })` is **rejected**; `update({ name })`
  and `update({ theme_preferences })` **succeed** (Policy A / `current_role_of`).
- An Officer's promote/demote of another user **succeeds** (Policy B).

## Local development

```
npm install
npm run dev        # start the dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src
npm run test       # vitest run
npm run build      # tsc -b && vite build
```
