# Class To-Do Board — Technical Design

## Overview

Class To-Do Board is a single-class, shared schedule and to-do tracker. It is a React + TypeScript + Vite single-page app backed by Supabase (Postgres + Auth). Anonymous visitors get full read access to the schedule, subject details, and task list; authenticated Officers get write controls for tasks and subjects; authenticated Members get the same read-only view as anonymous visitors plus the ability to be promoted. All write authorization is enforced at the database by Row-Level Security (RLS) — the UI only hides controls as a convenience, never as a security boundary.

The stack is locked: **React 18 + TypeScript + Vite**, **plain CSS variables (no Tailwind)**, **@supabase/supabase-js v2**, **DM Sans** (Google Fonts). There is no server of our own beyond Supabase. The *database schema is a deliverable of this design*: this document contains the authoritative DDL (section "Database Schema & RLS (authoritative DDL)") that must be shipped verbatim-equivalent as `supabase/migrations/0001_init.sql`. The field list, enums, FKs, and policy intent come from the task; this design makes them concrete and correct (function bodies, grants, policy clauses) so a coder can apply the migration without making any schema or security decision.

This design resolves the open architectural questions: the exact schema and RLS (including the `is_officer()` body and its recursion-avoidance, the two composing `profiles` UPDATE policies, and the table grants anonymous read needs); the CSS-token architecture and how light/dark base palettes compose with a user-chosen accent; the WCAG relative-luminance contrast computation and auto-adjust/warn flow with a fully specified adjustment algorithm; how glow state is derived (never stored) and recomputed live; the no-flash-of-wrong-theme pre-paint application with a single source of truth; how anonymous read works end to end; the component tree and realtime data strategy; and the "Configure Supabase" graceful-degradation path.

---

## Technology Stack (locked)

| Concern | Choice |
| --- | --- |
| Build/dev | Vite 5, React 18, TypeScript 5 (strict) |
| Styling | Plain CSS with custom properties (CSS variables). No Tailwind, no CSS-in-JS runtime. One global `tokens.css` + `base.css` + plain per-component class files. |
| Backend | Supabase: Postgres, Auth (email/password + Google OAuth), RLS, Realtime |
| Client lib | `@supabase/supabase-js` v2 |
| Font | DM Sans (weights 400/500/700), loaded via `<link>` in `index.html` with `font-display: swap` |
| Routing | A single page. No router library. The Appearance panel and admin panel are modals/popovers, not routes. (Deep-linking would add `react-router` later; out of scope now.) |
| State | React Context for session/profile and for theme; local component state for selection and data. No Redux/Zustand — the app is small enough. |
| Testing | Vitest + React Testing Library for units; the contrast math, auto-adjust, sort/derivation, and token resolution are pure functions and get direct unit tests, including a parity test between the inline bootstrap and `resolveTokens`. |

---

## Project Structure

```
classboard/
  index.html                      # loads the generated pre-paint theme bootstrap
  .env.example                    # VITE_SUPABASE_URL=, VITE_SUPABASE_ANON_KEY=
  .gitignore                      # ignores .env
  package.json
  tsconfig.json
  vite.config.ts                  # plugin that generates the inline bootstrap from theme-core.ts
  supabase/
    migrations/
      0001_init.sql               # the authoritative schema + RLS in this doc
  SETUP.md                        # env, Google OAuth, officer-bootstrap SQL, Realtime publication + replica-identity note, anon-Realtime verification (INSERT/UPDATE/DELETE), current_role_of coupling note, RLS proof curls
  src/
    main.tsx
    App.tsx
    lib/
      supabase.ts                 # client creation + config detection
      theme-core.ts               # DEPENDENCY-FREE pure core: base palettes, resolveTokens, contrast math, auto-adjust
      contrast.ts                 # re-exports / thin wrappers over theme-core contrast fns (for test discoverability)
      theme.ts                    # app-facing theme helpers that use theme-core
      sorting.ts                  # task sort (nearest deadline first)
      derive.ts                   # glow derivation, overdue detection
      types.ts                    # DB row types + domain types
    context/
      SessionProvider.tsx         # session + profile, role
      ThemeProvider.tsx           # theme prefs, resolved tokens, persistence
    data/
      useSubjects.ts              # fetch + realtime subjects
      useScheduleSlots.ts         # fetch + realtime slots
      useTasks.ts                 # fetch + realtime tasks
      mutations.ts                # addTask, removeTask, setTaskStatus, upsertSubject, setRole
    components/
      ConfigError.tsx             # "Configure Supabase" screen
      Header.tsx                  # title, "Officers can edit" tag, auth button, gear icon
      ScheduleGrid.tsx
      ScheduleCell.tsx            # the real <button> for a subject
      DetailsPanel.tsx
      TaskList.tsx
      TaskRow.tsx
      AddTaskDialog.tsx
      AppearancePanel.tsx         # mode, accent, tints, reset
      AdminPanel.tsx              # promote/demote (officers only)
      AuthDialog.tsx              # email/password + Google
      ContrastWarning.tsx
    styles/
      tokens.css                  # :root token declarations + mode base palettes
      base.css                    # resets, typography, focus-visible rules
```

A note on the single-source-of-truth decision for theme math: all palette and contrast logic lives in **`src/lib/theme-core.ts`**, which imports nothing from React or Supabase and uses no browser globals at module scope. Both the app (via `theme.ts`/`ThemeProvider`) and the pre-paint inline script are generated from this one module — see "Theme Persistence & No-Flash."

---

## Database Schema & RLS (authoritative DDL)

This is the authoritative schema. Ship it as `supabase/migrations/0001_init.sql`. It is not seeded — the user populates `subjects`, `schedule_slots`, and `tasks` in Supabase themselves.

```sql
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
  day        smallint not null check (day between 1 and 5),  -- 1=Mon .. 5=Fri
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
-- RLS filters rows, but table privileges gate access FIRST. Anonymous SELECT needs
-- BOTH a GRANT SELECT TO anon AND a permissive SELECT policy naming anon.
-- Writes are granted only to authenticated; anon has no write privilege at all,
-- and the officer check in the policies narrows authenticated writes to officers.
grant select on public.profiles, public.subjects, public.schedule_slots, public.tasks
  to anon, authenticated;
grant insert, update, delete on public.subjects, public.schedule_slots, public.tasks
  to authenticated;
grant update on public.profiles to authenticated;   -- row/column scope narrowed by policies below
-- (No write grants to anon. No service-role usage in the client.)

-- ============ profiles policies ============
-- Public read (names/roles visible; see Security Notes for the email implication).
create policy profiles_read
  on public.profiles for select
  to anon, authenticated
  using (true);

-- Policy A: a user may update their OWN profile, but may NOT change their own role.
-- The WITH CHECK compares the NEW role against the committed stored role via a
-- SECURITY DEFINER helper (snapshot-stable, does not depend on the SELECT policy).
create or replace function public.current_role_of(uid uuid)
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = uid;
$$;

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role_of(auth.uid()));

-- Policy B: an officer may update ANY profile, including role (promote/demote).
create policy profiles_update_officer
  on public.profiles for update
  to authenticated
  using (public.is_officer())
  with check (public.is_officer());

-- ============ subjects / schedule_slots / tasks policies ============
-- Public read for everyone.
create policy subjects_read       on public.subjects       for select to anon, authenticated using (true);
create policy slots_read          on public.schedule_slots for select to anon, authenticated using (true);
create policy tasks_read          on public.tasks          for select to anon, authenticated using (true);

-- Officer-only writes. FOR ALL applies USING to UPDATE/DELETE (existing rows) and
-- WITH CHECK to INSERT/UPDATE (new rows). An anon/member INSERT fails WITH CHECK;
-- an anon/member UPDATE/DELETE fails USING. Both clauses are is_officer().
create policy subjects_write      on public.subjects       for all to authenticated using (public.is_officer()) with check (public.is_officer());
create policy slots_write         on public.schedule_slots for all to authenticated using (public.is_officer()) with check (public.is_officer());
create policy tasks_write         on public.tasks          for all to authenticated using (public.is_officer()) with check (public.is_officer());

-- ============ Realtime publication ============
-- Publishes INSERT/UPDATE/DELETE for these tables. Clients reconcile strictly by `id`
-- taken from the `new` payload (UPDATE/INSERT) or the `old` payload (DELETE); the PK is
-- always present under the DEFAULT replica identity, so no REPLICA IDENTITY FULL is
-- needed for the current design. See the replica-identity contract note below before
-- adding any row-dependent (non `using(true)`) policy to a published table.
alter publication supabase_realtime add table public.subjects, public.schedule_slots, public.tasks;
```

### Why `current_role_of()` instead of an inline same-table subquery (Finding 3)

Policy A must express "the new row's role equals the user's *current* stored role." The original review flagged that an inline `role = (select role from profiles where id = auth.uid())` inside a `WITH CHECK` is self-referential and its evaluation semantics (which snapshot it reads, whether it depends on the SELECT policy) are unpinned. The fix routes that read through a `SECURITY DEFINER` function `current_role_of()`:

- Because it is `SECURITY DEFINER` with a pinned `search_path`, its internal `SELECT` **bypasses RLS**, so Policy A no longer silently depends on `profiles_read` staying `using(true)`.
- The freeze reads the *old* role for the right reason: under Postgres' default **READ COMMITTED** isolation, the function's `SELECT` runs against the current statement's MVCC snapshot and therefore sees the **committed, pre-UPDATE** `profiles` row — it does **not** see the in-flight new tuple produced by the same `UPDATE`. This is a property of MVCC statement-snapshot visibility, **not** of the `STABLE` marker. `STABLE` only tells the planner the function performs no writes and may be evaluated once per scan; it does not define snapshot visibility. We mark it `STABLE` for correct planning, but the "reads old role" guarantee comes from READ COMMITTED. Because the function's only argument is the constant `auth.uid()`, any per-scan caching the planner may apply is harmless — the value is the same for every candidate row.
- **Scope:** Policy A is written for and reasoned about **single-row self-updates** (`id = auth.uid()`, which matches at most one row). We do not extend this freeze to multi-row update paths; if such a path is ever added, the per-row freshness reasoning above must be re-examined, since a `STABLE` function folded per-scan reasons correctly here only because its argument is constant.
- All role *changes* therefore flow exclusively through Policy B (`profiles_update_officer`). Policy A permits self-updates to `name`/`theme_preferences` only, because any statement that changes `role` fails Policy A's `WITH CHECK` and (for a member) Policy B's `WITH CHECK` too.

The prose above claims only what the design relies on; the authoritative guarantee is the RLS integration test in Testability (a member's `update({name, role:'officer'})` is rejected; `update({name})` and `update({theme_preferences})` succeed), which exercises the real policy against a real Postgres instance rather than trusting the reasoning.

---

## Profiles UPDATE Policy Composition

Postgres combines multiple *permissive* policies for the same command with **OR**: a row passes if any policy's `USING` admits it, and a write passes if any policy's `WITH CHECK` admits the new row. The two policies compose:

- **Member edits own name/theme** → passes `profiles_update_self` (role unchanged, equals `current_role_of`). Policy B is false for them; irrelevant under OR. **Allowed.**
- **Member tries to set own role to officer** → fails `profiles_update_self`'s `WITH CHECK` (role changed ≠ current) and fails `profiles_update_officer`'s `WITH CHECK` (`is_officer()` false). **Rejected.** Self-escalation is impossible.
- **Officer promotes/demotes a member** → passes `profiles_update_officer` (`is_officer()` true). Policy A is irrelevant (`id ≠ auth.uid()`). **Allowed.**
- **Officer edits own name** → passes Policy A (role unchanged) or Policy B (`is_officer()`). **Allowed either way.**

Edge case — an officer demoting **themselves**: Policy B admits it (`is_officer()` is true at evaluation time), so a lone officer could lock the class out of write access. The admin UI disables the demote control on the current user's own row with a tooltip ("You can't demote yourself"). This is a UX guard, not a security boundary; the SQL still permits it, which is acceptable because it is not an escalation, only a self-foot-gun, and `SETUP.md` ships the officer-bootstrap SQL so recovery via direct DB access is always possible.

The client `setRole(userId, role)` mutation issues `supabase.from('profiles').update({ role }).eq('id', userId)` and relies entirely on Policy B for authorization; it never trusts the UI's officer check.

---

## Supabase Client & Graceful Degradation ("Configure Supabase")

`src/lib/supabase.ts` reads `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`.

- **Detection:** `export const isConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url))`. The URL must be a non-empty http(s) URL; the key must be non-empty. We do not validate the key's JWT shape (it can change).
- **When configured:** create the client once with `createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`. `detectSessionInUrl` is required for the Google OAuth redirect to complete. We never force sign-in; the anon key alone authorizes the Postgres `anon` role, which is exactly what anonymous read needs.
- **When NOT configured:** export `supabase = null` and `isConfigured = false`. `App.tsx` checks `isConfigured` first and renders `<ConfigError />` — a static, dependency-free screen naming which env vars are missing and pointing to `SETUP.md`. No Supabase call is attempted, so the app never crashes with an opaque null/network error. `ConfigError` uses the default dark palette tokens so it is styled.

This makes the missing-config path a deliberate, legible state, satisfying "show a clear message instead of crashing."

---

## Anonymous Read, End to End

The security model splits **read** (public) from **write** (officer-only), both enforced server-side by RLS. Anonymous read requires *two* server-side things, both present in the DDL above (Finding 4):

1. **Table privilege:** `grant select on <table> to anon` — RLS runs only after the table privilege check; without the grant, anon SELECT returns permission-denied regardless of policy.
2. **RLS SELECT policy:** `create policy <t>_read ... for select to anon, authenticated using (true)`.

End to end:

1. The browser loads the SPA with only the anon key. Supabase treats requests with the anon key and no user JWT as the Postgres `anon` role.
2. Both halves above are satisfied for `subjects`, `schedule_slots`, `tasks`, and `profiles`, so an un-authenticated client reads them. (`profiles` is world-readable per the spec; see Security Notes.)
3. The data hooks (`useSubjects`, `useScheduleSlots`, `useTasks`) run unconditionally on mount regardless of auth state; they never gate on a session.
4. Selection, the details panel, task sorting, and glow derivation are pure client computations over read data, so they work identically for anonymous and authenticated users.
5. Write affordances (Add task, remove, status toggle, admin, subject edit) render only when `profile.role === 'officer'`. A forged write from anon/member is rejected at the DB: an INSERT fails the `WITH CHECK (is_officer())` (an anon has `auth.uid()` null → `is_officer()` false; a member's role is not officer → false); an UPDATE/DELETE fails the `USING (is_officer())`. Postgres returns a permission error the client surfaces as a toast. This is the mechanism behind acceptance criteria (1) and (7).

Anon has **no** write table privilege at all, so even before policy evaluation an anon write is denied — defense in depth over the policy check.

---

## Theme Token Architecture

### Token set (the complete contract)

Every component consumes only these tokens; no component hardcodes a color.

```
--bg               page background
--surface          card/panel background
--surface-2        subtle raised/hover surface (derived from --surface)
--border           default border
--text             primary text
--muted            secondary text
--accent           user accent used as a FILL or GLOW (buttons' background, glow halo, highlight fills)
--accent-contrast  readable text/icon color placed ON --accent (computed: black or white)
--accent-text      accent used as FOREGROUND TEXT on --bg/--surface (links, accent-colored labels);
                   equals --accent when it already clears AA, else the auto-adjusted value, else --text
--accent-weak      low-alpha accent for the glow halo / tints (derived from --accent)
--focus-ring       focus outline color (defaults to --accent-text so the ring is always visible)
--danger           overdue/destructive (fixed per mode, NOT user-themed)
--danger-contrast  readable text on --danger (fixed per mode)
--dot-ring         ring color for the pending dot badge (= --text) so the dot shape survives any accent
--radius           12px corner radius (10–14px range)
--font-sans        DM Sans stack
```

`--surface-2`, `--accent-contrast`, `--accent-text`, and `--accent-weak` are *derived*, never asked of the user directly.

**`--accent` vs `--accent-text` usage rule (Finding 7):**
- Use **`--accent`** when the accent is a *background fill* or decorative glow: button backgrounds, the schedule-cell glow halo, selected-row highlight fills, the pending-dot fill.
- Use **`--accent-text`** when the accent is *foreground text or an icon on `--bg`/`--surface`*: links, accent-colored labels, the "Officers can edit" tag text if accent-colored, icon strokes.
- Button labels sitting on an `--accent` fill use **`--accent-contrast`** (black or white), never `--accent-text`.

Components and the token they read: `TaskRow`/`DetailsPanel` links → `--accent-text`; `AddTaskDialog` submit button → `--accent` fill + `--accent-contrast` label; `ScheduleCell` glow → `--accent` halo + `--accent-weak`; pending dot → `--accent` fill + `--dot-ring` ring; overdue badge → `--danger` + `--danger-contrast`; focus ring everywhere → `--focus-ring`.

### Base palettes per mode

Two base palettes in `tokens.css`, selected by `data-mode="light|dark"` on `<html>` (never "system" — system resolves to light/dark before application):

- **Dark base (default):** `--bg:#0E1726; --surface:#15223A; --border:#24344F; --text:#E8EDF5; --muted:#9AA8BF;` default `--accent:#FFB547`. `--danger:#F0666B; --danger-contrast:#1A0A0B`.
- **Light base:** `--bg:#F5F7FB; --surface:#FFFFFF; --border:#D5DCE8; --text:#141C2B; --muted:#5B6881;` same default `--accent:#FFB547`. `--danger:#C62F36; --danger-contrast:#FFFFFF`. Verified: `--text` #141C2B on #FFFFFF ≈ 15.9:1; #5B6881 on #FFFFFF ≈ 5.2:1 — both clear AA.
  - **Default-amber-as-text in light mode (expected, by design):** the default accent `#FFB547` on a white/near-white surface is only ≈1.76:1, far below AA for text. So in the default *light* theme `adjustForAA` darkens `--accent-text` to a darkened amber (≈`#a36100`, ≈4.9:1) — links and accent-colored labels render a muted amber/brown out of the box, while `--accent` fills and the glow halo stay the full amber. This is the intended, correct output of the contrast guard applied to the shipped default, not a user-only edge case; implementers should expect light-mode default links to be the darkened amber, not `#FFB547`. (If amber links are visually undesirable, a slightly darker default accent for light mode is a cosmetic option, but the current defaults are AA-correct as specified.)

`--danger`/`--danger-contrast` are fixed per mode and not user-themable, so overdue flags always stay legible.

### Accent composed on top of both modes

The user's chosen accent is stored once (a single hex) and applied on top of whichever base palette is active. Switching Light↔Dark keeps the same accent hex; only the base palette swaps. This satisfies "switching modes keeps the accent."

Optional background and surface tints are stored as hex overrides for `--bg`/`--surface` and *replace* the base palette values for that mode when present. Because tints can harm text contrast, the contrast guard that protects the accent also runs over `--text` against a tinted `--bg`/`--surface`: if a tint drops text below AA, we warn and offer to discard the tint (keep base).

### Resolution function (`theme-core.ts`)

`resolveTokens(prefs, resolvedMode): Record<string,string>` — a pure function with no browser/React/Supabase dependency:

1. Start from the base palette map for `resolvedMode`.
2. Overlay `--accent` with `prefs.accent` (or default amber).
3. Compute `--accent-contrast = pickReadable(accent)` (black or white, higher ratio).
4. Compute `--accent-text = adjustForAA(accent, surface, resolvedMode)` (see auto-adjust below); if unreachable, `--accent-text = text`.
5. Compute `--accent-weak` as the accent at ~22% alpha (rgba from hex) for the glow halo.
6. Overlay `--bg`/`--surface` with tints if set; compute `--surface-2` as a mode-aware lighten (light) / darken (dark) of `--surface` by a fixed delta.
7. Set `--focus-ring = --accent-text`, `--dot-ring = --text`.
8. Return the full map. `ThemeProvider` writes each with `document.documentElement.style.setProperty(key, value)`.

Being pure, `resolveTokens` and all helpers are directly unit-testable.

### Pending/glow indicator is not color-alone (Finding 12)

The glow is an amber border + soft `box-shadow` halo using `--accent`/`--accent-weak`, **plus** a small solid dot badge on the cell. The dot is a **shape** cue, so pending vs non-pending is distinguishable without relying on color perception, in both modes. To ensure the dot itself survives any accent (including a low-contrast one against a tinted surface), the dot is rendered as an `--accent` fill with a 1px `--dot-ring` (= `--text`) ring. The `--text`-colored ring is guaranteed to contrast with `--surface` (the base palettes enforce AA for text on surface), so the dot's silhouette is always visible even when the fill color is weak.

---

## WCAG Contrast Computation & Auto-Adjust

`theme-core.ts` implements the real WCAG math — no eyeballing. `contrast.ts` re-exports these for test discoverability.

```ts
function hexToRgb(hex: string): { r: number; g: number; b: number } { /* parse #RRGGBB */ }

// WCAG relative luminance
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// luminance from a hex string (Finding 10: single consistent helper)
const lum = (hex: string) => relativeLuminance(hexToRgb(hex));

// WCAG contrast ratio, >= 1
function contrastRatio(a: string, b: string): number {
  const [L1, L2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}

// choose black or white text to sit on `bg`
function pickReadable(bg: string): '#000000' | '#FFFFFF' {
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#000000') ? '#FFFFFF' : '#000000';
}

const AA_NORMAL = 4.5;
```

### Auto-adjust algorithm (fully specified — Finding 8)

`adjustForAA(accent, surface, mode): string` is a pure, terminating function used to compute `--accent-text`:

1. If `contrastRatio(accent, surface) >= AA_NORMAL`, return `accent` unchanged (the user's hue is already readable as text).
2. Otherwise convert `accent` to HSL and step its **lightness** toward the readable end: **decrease** L in **light mode** (darken), **increase** L in **dark mode** (lighten). Step size **2 percentage points of L per iteration**, **max 50 iterations** (which spans the full 0–100 L range). The comparison target is the **surface the links sit on** (`--surface`), since links render on cards; where links also appear directly on `--bg`, implementers pass `--bg` and the panel takes the stricter of the two by calling `adjustForAA` against each and keeping the one with the lower passing lightness delta — but the default and tested target is `--surface`.
3. After each step, re-check `contrastRatio(candidate, surface)`; the first candidate `>= AA_NORMAL` wins and is returned.
4. **Termination/failure branch:** if 50 steps are exhausted without reaching 4.5 (e.g. a saturated hue that never clears AA against this surface without desaturating), **fall back to `--text`** for `--accent-text` and surface the `ContrastWarning` ("This accent isn't readable as link text in {mode} mode; links use the default text color"). We deliberately do not desaturate — preserving hue is less surprising than silently changing color, and `--text` is a guaranteed-AA fallback.

The function is bounded (≤50 iterations), total, and pure, so it is unit-tested at the boundary: a mid-tone accent that passes unchanged; a too-light accent in light mode that darkens to pass; a saturated accent that exhausts steps and returns `--text`.

### Where contrast checks are applied

1. **`--accent-contrast`** (button label on an accent fill): always auto-computed via `pickReadable(accent)`, silent — black-or-white against any color clears AA for one choice in practice. We also assert `max(ratio) >= 4.5`; in the rare degenerate case we pick the higher ratio and surface a warning.
2. **`--accent-text`** (links/accent labels on `--bg`/`--surface`): computed via `adjustForAA`. If it had to fall back to `--text`, the Appearance panel shows the `ContrastWarning`. The user's chosen hue is preserved for fills/glow via `--accent`; only the text rendering adjusts.
3. **Background/surface tints vs `--text`:** when a tint is set, check `contrastRatio(text, tintedBg)` and `contrastRatio(text, tintedSurface)`. Below 4.5 → warn and offer one-click discard-tint (keep base). We do not silently override the user's bg choice.

This satisfies acceptance criterion (5): the computation is real (WCAG relative-luminance), and every text/background combination the user can produce is checked against AA 4.5.

---

## Glow Derivation (never stored) & Overdue

`src/lib/derive.ts` is pure. Date fields are the Postgres `date` type and are consumed as raw `YYYY-MM-DD` strings — **never passed through `new Date()`** — so lexicographic comparison is valid and timezone-free (Finding 9):

```ts
// A subject glows iff it has >= 1 pending task.
function subjectHasPending(subjectId: string, tasks: Task[]): boolean {
  return tasks.some(t => t.subjectId === subjectId && t.status === 'pending');
}

// overdue: pending AND deadline present AND deadline strictly before today.
// `today` is the viewer's LOCAL date formatted YYYY-MM-DD; `deadline` is the raw
// date string from Supabase. Both are zero-padded YYYY-MM-DD, so string < is correct.
function isOverdue(t: Task, today: string): boolean {
  return t.status === 'pending' && t.deadline != null && t.deadline < today;
}

// The viewer's LOCAL calendar date as a zero-padded YYYY-MM-DD string.
// MUST use local getters (NOT toISOString(), which is UTC and would shift the day
// across midnight) and MUST +1 the 0-based month and zero-pad month/day, or the
// string compare in isOverdue silently breaks near midnight or by a whole month.
function localTodayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

**Date contract (explicit):** `given_date` and `deadline` are Postgres `date`, returned by Supabase as `YYYY-MM-DD` strings. The `types.ts` domain type declares them as `string | null`, and no code path coerces them through `Date`. `today` is produced once per render tick as the viewer's local date via the `localTodayISO()` helper defined above (local `getFullYear`/`getMonth()+1`/`getDate`, zero-padded — explicitly **not** `toISOString()`, which is UTC). **Overdue is evaluated in the viewer's local timezone by design** — two users in different timezones may briefly disagree about a same-day deadline; this is an accepted, documented consequence, not a bug. Unit tests cover same-day (not overdue), one-day-past (overdue), and no-deadline (never overdue).

The subjects' glow is computed by `ScheduleGrid`/`ScheduleCell` directly from the current `tasks` array in React state — there is no `glow` column anywhere. Because `useTasks` keeps that array live via Realtime, adding a task flips `subjectHasPending` to true and the cell re-renders with the glow instantly for every connected client, including anonymous ones; removing or completing the last pending task flips it back and the glow stops. This is acceptance criteria (2) and the "derived, never stored" rule.

Overdue tasks stay in the data (no auto-removal) and render with a `--danger` border/badge in both the details panel and the right-hand list; they disappear only when an officer completes or removes them.

---

## Task Sorting

`src/lib/sorting.ts`: nearest deadline first, no-deadline tasks last, stable by `given_date` then `id` as tiebreakers. Operates on the `YYYY-MM-DD` strings directly.

```ts
tasks.sort((a, b) => {
  if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : tie(a, b);
  if (a.deadline && !b.deadline) return -1;   // dated before undated
  if (!a.deadline && b.deadline) return 1;
  return tie(a, b);                            // both undated
});
```

Pure and unit-tested. The right-hand `TaskList` applies this to all tasks; the `DetailsPanel` applies it to the selected subject's **pending** tasks only.

---

## Data Loading & Realtime Strategy

Three hooks, each: (a) initial fetch on mount, (b) subscribe to a Postgres-changes Realtime channel, (c) reconcile into local state.

- `useSubjects`: `select *` from `subjects`; realtime on `subjects`.
- `useScheduleSlots`: `select *` from `schedule_slots`; realtime on `schedule_slots`.
- `useTasks`: `select *` from `tasks`; realtime on `tasks`. This is the hot one — glow and lists depend on it.

Realtime reconciliation: on `INSERT` append, on `UPDATE` replace by id, on `DELETE` filter out by id. We keep normalized arrays in state and derive everything else (glow, sorted list, selected-subject pending) with the pure functions above, memoized with `useMemo` keyed on the relevant array.

**Replica-identity contract (Finding 1).** The reconciliation above keys exclusively on `id` — from the `new` payload for INSERT/UPDATE and from the `old` payload for DELETE. Under Postgres' **default replica identity**, a `postgres_changes` DELETE event's `old` payload contains **only the primary key** (and an UPDATE's `old` payload is likewise limited), while the `new` payload carries the full new row. Because we never read any non-PK column out of a DELETE's `old` payload (and we take all UPDATE fields from `new`), the default identity is sufficient for this design — we do **not** set `REPLICA IDENTITY FULL`. One subtlety that makes this safe: Realtime applies the table's RLS SELECT policy to decide whether to deliver each event, and our policies are `using(true)`, so delivery never depends on evaluating a column that might be absent from an `old` payload. **If any published table ever gets a row-dependent SELECT policy** (anything other than `using(true)`), that policy may need to evaluate `old`-row columns to authorize UPDATE/DELETE delivery, which the default identity does not provide — in that case add `alter table public.<t> replica identity full;` for the affected table(s). This is called out so the implementer does not rediscover it, and a one-line check is folded into the anon-Realtime verification step in `SETUP.md`.

### Anon Realtime delivery is a verified prerequisite, with a fallback (Finding 5)

Anonymous glow updates (criterion 2 "for everyone") depend on three things, not just "Realtime enabled": the tables are in the `supabase_realtime` publication (done in the DDL), the `anon` role satisfies the SELECT policy (it does — `using(true)` to `anon`), and the project's Realtime authorization permits anon delivery. This must be **verified**, not assumed:

- `SETUP.md` includes a verification step: open the app un-authenticated, have an officer INSERT a task in another session, and confirm the anon client receives the `postgres_changes` event and the subject starts glowing without a reload. The same step confirms an officer **UPDATE** (status toggle to `done`) and **DELETE** (remove) reach the anon client and stop the glow — exercising all three event types the glow logic relies on. (These work under the default replica identity because reconciliation keys only on the PK, which is always present; see the replica-identity contract above.)
- **Fallback if anon Realtime proves unreliable** in the target Supabase version: `useTasks` (and the other hooks) accept a `pollMs` option; when a `REALTIME_FALLBACK` flag is set (env or a runtime check that detects no events arriving within N seconds of subscribing), the hooks switch to a periodic `select *` refetch every 15s. Derivation is identical either way, so glow correctness does not depend on the transport. The fallback is specified now so the implementer is not left guessing if anon Realtime misbehaves.

Loading/empty/error states per hook: `status: 'loading' | 'ready' | 'error'` plus `data`. Because the user is **not** seeding data through us, empty is first-class: `ScheduleGrid` with zero slots shows "No schedule yet — an officer can add subjects in Supabase"; `TaskList` with zero tasks shows "No tasks yet." Error state (transient network) shows an inline retry. `SETUP.md` documents the `alter publication` step (also present in the migration) and the anon-Realtime verification.

---

## Component Tree & Responsibilities

```
App
├─ (if !isConfigured) ConfigError
└─ SessionProvider           // session, profile row, role; refetch profile on auth change
   └─ ThemeProvider          // reads prefs (profile.theme_preferences or localStorage), applies tokens
      └─ Layout
         ├─ Header            // title, "Officers can edit" tag, Sign in / profile menu, gear (Appearance), admin entry (officers)
         ├─ Main (grid 70/30 desktop; stacked mobile)
         │  ├─ LeftColumn
         │  │  ├─ ScheduleGrid
         │  │  │  └─ ScheduleCell (button)   // glow derived; onClick -> setSelectedSubjectId
         │  │  └─ DetailsPanel               // selected subject's pending tasks
         │  └─ RightColumn
         │     └─ TaskList
         │        └─ TaskRow                 // "Subject - Task", dates; officer: remove + status
         ├─ AddTaskDialog     (officers)
         ├─ AppearancePanel   (everyone; anon persists to localStorage only)
         ├─ AdminPanel        (officers)
         └─ AuthDialog
```

Selection state (`selectedSubjectId`) lives in `Layout` and is passed to both `ScheduleGrid` (highlight) and `DetailsPanel` (filter). Selecting a subject with no pending tasks shows an empty details state. This is acceptance criterion (3).

Desktop layout is a CSS grid `grid-template-columns: 70% 30%` with the left column stacking schedule over details; mobile (`max-width` breakpoint) collapses to a single column in order schedule → details → list, and `ScheduleGrid` gets `overflow-x: auto` so the Mon–Fri grid scrolls horizontally if needed. Every interactive element (`ScheduleCell`, Add, remove, status toggle, theme controls, admin controls) is a real `<button>` with a visible `:focus-visible` ring using `--focus-ring` — acceptance criterion (6).

### SessionProvider

Subscribes to `supabase.auth.onAuthStateChange`. On a session, fetches the `profiles` row for `auth.uid()` to get `role` and `theme_preferences`. On sign-out/no session, `profile = null`, role effectively anonymous. Exposes `{ session, profile, role: profile?.role ?? null, isOfficer: profile?.role === 'officer', refreshProfile }`.

Edge: there is a brief window after first OAuth sign-up before the `handle_new_user` trigger's profile row is readable. `SessionProvider` retries the profile fetch once after a short delay if it returns no row for an existing session, then treats the user as a default member if still absent.

---

## Theme Persistence & No-Flash-of-Wrong-Theme

### Single source of truth for theme math (Finding 6)

All palette/contrast/token logic lives in **`theme-core.ts`**, which is dependency-free (no React, Supabase, or browser globals at module scope). The pre-paint inline script is **generated from this same module at build time** — it is not a hand-maintained duplicate:

- **Concrete generation mechanism (do not hand-serialize functions).** A small Vite plugin in `vite.config.ts` (hooking `transformIndexHtml`) does **not** call `Function.prototype.toString()` on individual functions — that drops transitive module dependencies (`resolveTokens` calls `relativeLuminance`, `contrastRatio`, `pickReadable`, `adjustForAA`, `hexToRgb`, the HSL helpers, and references the base-palette maps), and a naive inline string would reference undefined identifiers and throw. Instead the plugin runs **`esbuild.build({ entryPoints: ['src/lib/theme-core.ts'], bundle: true, format: 'iife', globalName: 'CBTheme', minify: true, write: false, platform: 'browser', target: 'es2018' })`**. `bundle: true` pulls the entire dependency graph of `theme-core.ts` (which is already dependency-free of React/Supabase/browser globals) into one self-contained string; `format: 'iife'` + `globalName: 'CBTheme'` exposes the module's exports (notably `resolveTokens` and `DEFAULT_PREFS`) on a single global. The plugin takes that one output string and injects it as an inline `<script>` into `<head>` of `index.html` **before** the app bundle, followed by a tiny bootstrap stub (also inline) that reads `localStorage`, resolves `system`, and calls `CBTheme.resolveTokens(...)`. Because `esbuild` resolves the whole graph, there are no dangling identifiers. (`theme-core.ts` loads fine in the Node build context as an esbuild entry; it is TS and dependency-free, so no extra transform config is needed.)
- A **parity unit test** guards against drift by exercising the **actual injected string**, not a re-derivation: in the test, run the same `esbuild.build({...write:false})` on `theme-core.ts`, `eval` the resulting IIFE string inside a jsdom/VM context to obtain the inlined `CBTheme.resolveTokens`, and assert that for a fixed set of prefs (default; custom accent; light tint; dark + accent) it returns token maps **byte-identical** to the directly-imported runtime `resolveTokens`. Evaluating the real bundle (rather than comparing two independent derivations) catches both math drift and any bundling/identifier breakage that would make the inline script throw at parse time and silently fall back to default-dark — the exact failure this section exists to prevent.

The inline bootstrap stub, at load: reads `localStorage.getItem('cb-theme')` (parsed defensively; missing/malformed → `CBTheme.DEFAULT_PREFS`), resolves `system` to light/dark via `matchMedia('(prefers-color-scheme: dark)')`, sets `document.documentElement.dataset.mode`, computes the token map via the bundled `CBTheme.resolveTokens(prefs, resolvedMode)`, and writes each custom property on `document.documentElement`. It runs before first paint, so the page paints in the correct theme with no flash. The stub is wrapped in try/catch and falls back to the default dark palette on any error (so even a bundling regression degrades to a styled default rather than a crash — though the parity test is what prevents that regression from shipping).

### Runtime persistence

`ThemeProvider` is the source of truth after hydration. Its preference object:

```ts
type ThemePrefs = {
  mode: 'light' | 'dark' | 'system';
  accent: string;              // hex #RRGGBB
  bgTint?: string;             // hex, optional
  surfaceTint?: string;        // hex, optional
};
```

- **Always** write `cb-theme` to `localStorage` on change (what the bootstrap reads next load), keeping the stored shape identical to what the inline script parses.
- **If logged in:** also persist to `profiles.theme_preferences` via `update({ theme_preferences: prefs }).eq('id', uid)` — allowed by `profiles_update_self` (role unchanged). On login, if the DB has prefs they win over localStorage (then we sync localStorage to match, so the next pre-paint is correct); if the DB is empty, we push current localStorage prefs up.
- **If anonymous:** localStorage only; no DB row is created or required.
- `system` mode subscribes to `matchMedia` changes and re-resolves live without a reload.
- "Reset to default" clears tints, sets accent back to amber, mode back to `system`, writes both stores (DB only if logged in), and re-applies tokens.

Theme changes only ever touch the current user's localStorage and (if logged in) their own profile row — never anyone else's. This is acceptance criterion (4).

---

## Mutations (officer writes)

`src/data/mutations.ts`, all thin wrappers that trust RLS, never a client role check, for authorization:

- `addTask(input)` → `insert` into `tasks`. On RLS denial, Postgres returns an error; the caller shows "Only officers can add tasks" and does not optimistically update. On success, Realtime delivers the row to all clients.
- `removeTask(id)` → `delete` from `tasks`.
- `setTaskStatus(id, status)` → `update { status }`. Completing the last pending task stops the subject glow via derivation.
- `upsertSubject` / schedule-slot writes → `insert`/`update`/`delete` on `subjects`/`schedule_slots` (minimal officer subject management; see Out of Scope).
- `setRole(userId, role)` → `update { role }` on `profiles`, authorized by Policy B.

We avoid optimistic UI for writes so the UI never shows a state the DB rejected; Realtime latency is low and the correctness guarantee is worth it.

---

## Validation of External Inputs

| Input | Rules | On failure |
| --- | --- | --- |
| Add-task `title` | required, trimmed, 1–200 chars | inline field error; submit disabled while invalid |
| Add-task `notes` | optional, 0–2000 chars | counter + truncate guard |
| Add-task `givenDate` | required date; defaults to today | native date input constrains format |
| Add-task `deadline` | optional date; if earlier than `givenDate`, warn (not block) | inline warning; still allowed (back-dating may be legitimate) |
| Accent / tint hex | must match `/^#([0-9a-fA-F]{6})$/`; picker emits valid hex, manual entry validated | reject invalid, keep previous value, show hint |
| `theme_preferences` from DB | parsed defensively; unknown/missing fields → defaults; non-object → defaults | never throw; `console.warn` |
| Env vars | see Configure Supabase | ConfigError screen |

Client validation is UX only. The server trusts RLS for authorization and Postgres column constraints (`not null`, enum, `day between 1 and 5`, FK) for integrity; a malformed direct API call still fails at the DB.

---

## Error Handling (per fallible operation)

| Operation | Failure | Recoverable? | Caller receives | Logging |
| --- | --- | --- | --- | --- |
| Client init | missing/invalid env | Fatal (graceful) | `ConfigError` screen | none (expected) |
| Initial fetch (subjects/slots/tasks) | network/5xx | Recoverable | hook `status:'error'` + inline retry | `console.error` |
| Realtime subscribe | channel error/drop / no anon delivery | Recoverable | silent reconnect; if no events within N s, switch to poll fallback; subtle "reconnecting" dot if it persists | `console.warn` |
| `addTask`/`removeTask`/`setTaskStatus` | RLS denial (non-officer) | expected rejection | toast "Only officers can do that" | `console.warn` |
| any write | network/5xx | Recoverable | toast "Couldn't save, try again"; no state change | `console.error` |
| `setRole` | RLS denial | expected for non-officers | toast; UI already hides it | `console.warn` |
| Auth sign-in (email/pw) | bad credentials | Recoverable | inline form error from Supabase message | none |
| Auth (Google OAuth) | redirect/popup failure | Recoverable | inline error, retry | `console.error` |
| Profile fetch after login | row not yet created | Recoverable | one delayed retry, then member default | `console.warn` |
| theme persist to DB | network | Recoverable | silent; localStorage already holds it, retried next change | `console.warn` |
| Contrast degenerate case | no AA-passing text color | rare | warn in Appearance panel; `--accent-text` falls back to `--text` | `console.warn` |

Nothing throws uncaught to the user. A top-level React error boundary wraps `Layout` and renders a minimal "Something went wrong — reload" card using tokens, logging the error to console.

---

## Invariants & Ownership

| Invariant | Enforced by | Why there |
| --- | --- | --- |
| Only officers write tasks/subjects/slots | DB (RLS ALL `is_officer()`; INSERT via WITH CHECK, UPDATE/DELETE via USING) + no anon write grant | Only trustworthy layer; UI hiding is cosmetic |
| A user cannot self-escalate role | DB (`profiles_update_self` WITH CHECK via `current_role_of`) | Security boundary must be server-side |
| Officers can change any role | DB (`profiles_update_officer`) | Server-side authority |
| `is_officer()` never recurses on `profiles` | DB (`SECURITY DEFINER` + pinned `search_path`) | Bypasses RLS inside the helper, breaking the policy cycle |
| Glow reflects pending tasks exactly | Client derivation over live tasks | "Derived, never stored"; single source = tasks table |
| Theme applies before first paint | Build-generated pre-paint inline script | Only pre-bundle code runs before paint |
| Inline bootstrap matches runtime theme math | CI parity test over `theme-core.ts` | Prevents cold-load flash from drift |
| Button-on-accent text is readable | Client (`pickReadable`) | Computed per accent; cannot be static |
| Accent-as-link text meets AA | Client (`adjustForAA` → `--accent-text`, fallback `--text`) | Guaranteed-readable link text |
| Referential integrity (task→subject, slot→subject) | DB FKs (`on delete cascade`) | Integrity belongs in the DB |
| day ∈ 1..5, enums valid | DB column checks/enums | Integrity belongs in the DB |

---

## Edge Cases

- **No data at all** (fresh DB, nothing seeded): schedule and list render first-class empty states, not blank boxes or infinite spinners.
- **Subject with no slots** but with tasks: appears in the right-hand list and glows logic-wise, but has no grid cell to glow. Acceptable; the list is the complete view. Noted so implementers don't treat it as a bug.
- **Task with no deadline:** sorts last; never flagged overdue (overdue requires a deadline).
- **Deadline earlier than given date:** allowed, warned.
- **Selected subject's last pending task completed:** details panel shows empty state; selection persists.
- **Selected subject deleted by another officer (realtime):** selection clears to none; details shows the no-selection empty state.
- **System mode + OS theme change at runtime:** `matchMedia` listener re-resolves tokens live, no reload.
- **Accent at extreme luminance (pure white/black):** `pickReadable` still returns the better of the two; `adjustForAA` either passes trivially or falls back to `--text` with a warning.
- **Saturated accent unreadable as text in a mode:** `adjustForAA` exhausts its 50 steps and `--accent-text` falls back to `--text`; the glow/fill still uses the user's exact `--accent`.
- **Officer demotes self (lone officer):** UI blocks self-demote; DB allows it; recovery via `SETUP.md` bootstrap SQL.
- **OAuth redirect returns to app:** `detectSessionInUrl` completes the session; profile row may lag → retry.
- **Clock/timezone for overdue:** uses viewer local date; a task due "today" is not overdue until the local date passes it. Explicitly intentional.
- **Anon Realtime not delivering:** poll fallback keeps glow/list fresh within 15s.

---

## Testability

**Unit (Vitest) — pure functions, high value, no mocks:**
- `theme-core.ts`/`contrast.ts`: `relativeLuminance` and `contrastRatio` against known WCAG reference pairs (black/white = 21:1; #FFB547 vs black vs white); `pickReadable` picks the higher-ratio color; AA boundary cases.
- `adjustForAA`: mid-tone accent passes unchanged; too-light accent in light mode darkens to pass; saturated accent exhausts 50 steps and returns `--text`; verifies termination and the failure branch.
- `sorting.ts`: dated-before-undated, nearest-first, undated-last, stable tiebreak.
- `derive.ts`: `subjectHasPending` toggles correctly; `isOverdue` for same-day (not overdue), one-day-past (overdue), no-deadline (never) using `YYYY-MM-DD` strings; `localTodayISO(fixedDate)` zero-pads a single-digit month and day (e.g. `new Date(2025,0,3)` → `"2025-01-03"`, proving the `+1` month and the pads) and matches the local calendar date rather than the UTC date for a time near midnight.
- `theme.ts`/`resolveTokens`: expected maps for dark/light, accent overlay, tint overlay, mode-switch preserves accent, `--accent-text`/`--accent-contrast` derivation.
- **Parity test:** re-run the plugin's `esbuild.build({ ...bundle:true, format:'iife', globalName:'CBTheme', write:false })` on `theme-core.ts`, `eval` the resulting IIFE string in a jsdom/VM context, and assert the inlined `CBTheme.resolveTokens` returns token maps byte-identical to the directly-imported runtime `resolveTokens` for a fixed prefs set (default, custom accent, light tint, dark+accent). Evaluating the actual bundle also catches a parse-time throw / dangling-identifier regression in the inline script, not just math drift.

**Component (RTL):**
- `ScheduleCell` renders a real `<button>`, is keyboard-focusable with a visible focus ring, shows the ringed dot badge when pending.
- Officer-only controls (`AddTaskDialog` trigger, `TaskRow` remove/status) render for officer role and are absent for member and anon.
- `ConfigError` renders when `isConfigured` is false.
- Admin demote control is disabled on the current user's own row.

**Integration (against a real Supabase project — RLS is the actual boundary, so not mocked):**
- Anon SELECT works on all four tables.
- Anon and member INSERT/UPDATE/DELETE on `tasks` is rejected (criterion 1), proven by a direct API call / curl in `SETUP.md`.
- Member `update({name, role:'officer'})` is rejected; `update({name})` and `update({theme_preferences})` succeed (Policy A/`current_role_of`).
- Officer promote/demote of another user succeeds (Policy B).
- An officer task INSERT delivers a Realtime `postgres_changes` event to an un-authenticated subscriber (anon Realtime), or the poll fallback refreshes within 15s.

The design keeps all authorization in the DB and all computed UI logic in pure functions in `lib/`, which is what makes it both testable and secure. Anything hard to unit test is a signal it belongs in `lib/` as a pure function — which this structure already does.

---

## Security Notes

- `profiles` SELECT is `using(true)` with `grant select ... to anon` per the schema, so names, emails, and roles are world-readable with the anon key. This is a property of the specified public-read model. Implementers should surface only `name`/`role` in the admin UI and avoid rendering emails publicly. If email privacy is later required, that is a follow-on schema change (a `profiles_public` view exposing only `id`/`name`/`role`, with the base table locked down) and is out of scope here.
- The anon key is a public client credential by Supabase design; shipping it in the SPA is expected and safe because RLS — not key secrecy — enforces authorization. The service-role key must never reach the client; it is used nowhere in this app.
- `is_officer()` and `current_role_of()` are `SECURITY DEFINER` with `set search_path = public`; the pinned search path prevents a definer-privilege hijack via a shadowed table/function.
- **`current_role_of()` is load-bearing for *all* self-updates, not just role freezing.** `profiles_update_self`'s `WITH CHECK` calls it on every self-update, so each logged-in **theme-preferences save** also evaluates `current_role_of(auth.uid())`. This is correct and intentional, but it means the function must ship and stay in place alongside the policies: dropping or renaming it independently would silently break ordinary theme persistence (and self name edits), not only role changes. There is no per-save correctness concern — it is one lightweight indexed-PK `SELECT` — but `SETUP.md` notes this coupling so it is not treated as an isolated helper safe to remove.
- Write privileges are granted only to `authenticated`, never `anon`; the officer policies narrow authenticated writes to officers. Defense in depth: an anon write is denied at the table-privilege layer before policy evaluation.
- `.env` is gitignored; `.env.example` is committed with placeholder keys only.

---

## Out of Scope (this design)

- A full subject/schedule-slot editing CRUD UI beyond what the ALL policy and build order imply; the task's build order centers on **task** CRUD. Subject management is wired at the mutation layer and can get a minimal officer form, but a rich schedule editor is deferred (the user populates subjects/slots directly in Supabase for now).
- Seeding any data.
- Multi-class support, routing/deep-linking, notifications, and email-verification flows beyond Supabase defaults.
- A privacy-preserving `profiles_public` view (follow-on if email exposure must be eliminated).
- Automated end-to-end browser tests (Playwright) — recommended later; manual/scripted RLS verification is specified now.

---

## Responses to Design Review Findings

### Review round 2 (current `design-review.md` / `design-verdict.json` — 3 MEDIUM + 3 NIT)

Each finding is addressed below.

1. **MEDIUM — Realtime UPDATE/DELETE payloads require a stated REPLICA IDENTITY contract. ADDRESSED.** Added an explicit "Replica-identity contract" paragraph to Data Loading & Realtime Strategy and a comment on the `alter publication` line in the DDL: reconciliation keys only on the PK (`new` for INSERT/UPDATE, `old` for DELETE), which is always present under the default replica identity, so `REPLICA IDENTITY FULL` is **not** needed; RLS-filtered delivery is safe because policies are `using(true)`. Documented that any future row-dependent SELECT policy on a published table would require `alter table ... replica identity full;`. The `SETUP.md` anon-Realtime verification now exercises INSERT **and** UPDATE **and** DELETE and includes the one-line identity check.

2. **MEDIUM — Pre-paint bootstrap generation needs a concrete mechanism. ADDRESSED.** Replaced the hand-wave with a pinned mechanism: the Vite plugin runs `esbuild.build({ entryPoints:['src/lib/theme-core.ts'], bundle:true, format:'iife', globalName:'CBTheme', write:false, ... })` so the entire dependency graph (`resolveTokens` + `relativeLuminance`/`contrastRatio`/`pickReadable`/`adjustForAA`/`hexToRgb`/HSL helpers/base palettes) is captured in one self-contained IIFE string exposing `CBTheme.resolveTokens`/`CBTheme.DEFAULT_PREFS`, injected inline before the app bundle with a tiny stub that calls it. Explicitly rejected `Function.prototype.toString()` (drops transitive deps). The parity test now `eval`s the **actual** esbuild IIFE string in jsdom/VM and compares to runtime `resolveTokens`, catching parse-time/identifier breakage, not just math drift.

3. **MEDIUM — `current_role_of()` freeze justification cited STABLE rather than MVCC. ADDRESSED.** Rewrote the justification: the old-role read is a property of **MVCC statement-snapshot visibility under default READ COMMITTED** (the definer SELECT sees the committed pre-UPDATE row, not the in-flight tuple), not of the `STABLE` marker (which is only a planner hint); constant `auth.uid()` argument makes per-scan folding harmless. Explicitly scoped Policy A to **single-row self-updates** and flagged that multi-row paths would need re-examination. Prose now defers the real guarantee to the RLS integration test.

4. **NIT — Default amber as link text in light mode becomes brown; not flagged. ADDRESSED.** Added a bullet to the light-base description: the default `#FFB547` is ≈1.76:1 on white, so `adjustForAA` resolves `--accent-text` to a darkened amber (≈`#a36100`) in light mode by design — default light links render muted amber/brown while `--accent` fills/glow stay full amber. Noted this is expected shipped behavior, with a darker light-mode default accent as an optional cosmetic choice.

5. **NIT — `localTodayISO()` undefined (month/UTC trap). ADDRESSED.** Defined the body in `derive.ts` using local getters with `getMonth()+1` and zero-padding, with an explicit comment forbidding `toISOString()`. Updated the Glow Derivation prose to reference it precisely and added `localTodayISO` cases (single-digit month/day zero-pad; local-vs-UTC near midnight) to the `derive.ts` unit tests.

6. **NIT — Member theme save couples to `current_role_of` via Policy A. ADDRESSED (documentation).** No correctness change. Added a Security Notes bullet (and a `SETUP.md` note) stating `current_role_of` is load-bearing for all self-updates including theme-preference saves, so it must ship and remain alongside the policies; dropping/renaming it would silently break ordinary theme persistence, not just role freezing.

### Review round 1 (prior review — resolved in the revision this doc superseded)

1. **HIGH — "locked schema" doesn't exist. ADDRESSED.** The schema is no longer described as locked/external. This design now contains the authoritative DDL (section "Database Schema & RLS") with exact column types, both enums, FKs, the `day between 1 and 5` check, `theme_preferences jsonb`, the `handle_new_user` trigger, the full `is_officer()` body, and every `create policy`, to be shipped as `supabase/migrations/0001_init.sql`. Overview and Out of Scope were rewritten to call the schema a deliverable of this design.
2. **HIGH — `is_officer()` body / SECURITY DEFINER / recursion. ADDRESSED.** The function is written in full as `language sql, stable, security definer, set search_path = public`, with an inline comment and a prose note explaining it is `SECURITY DEFINER` specifically to break the RLS recursion on `profiles` and that `search_path` is pinned against hijack.
3. **HIGH — Policy A WITH CHECK self-referential subquery. ADDRESSED.** Replaced the inline same-table subquery with a `SECURITY DEFINER` helper `current_role_of(uid)` that bypasses RLS (so Policy A no longer depends on the SELECT policy) and reads the committed/old role via a `stable` function. Role changes flow only through Policy B. An RLS integration test (member `update({name,role})` rejected, `update({name})` succeeds) is specified in Testability.
4. **MEDIUM — GRANT vs policy for anon. ADDRESSED.** The DDL includes explicit `grant select on ... to anon, authenticated` alongside the `for select to anon, authenticated using (true)` policies, and writes are granted only to `authenticated`. The Anonymous Read section states both halves are required and why.
5. **MEDIUM — anon Realtime asserted. ADDRESSED.** The publication is added in the migration; a concrete verification step (anon client receives an officer's INSERT event) is specified for `SETUP.md`; and a poll-every-15s fallback is designed into the hooks so glow correctness does not depend on the transport.
6. **MEDIUM — bootstrap duplicates resolveTokens. ADDRESSED.** All theme math lives in dependency-free `theme-core.ts`; the inline bootstrap is **generated from it at build time** via a Vite plugin, and a CI parity test asserts the inline script and runtime `resolveTokens` produce identical maps.
7. **MEDIUM — `--accent-text` missing from the contract. ADDRESSED.** `--accent-text` (and `--dot-ring`, `--danger-contrast`) are added to the token set with an explicit `--accent` vs `--accent-text` usage rule and a per-component list of which token each reads.
8. **MEDIUM — auto-adjust algorithm underspecified. ADDRESSED.** `adjustForAA` is fully specified: HSL lightness, 2% step, max 50 iterations, target `--surface`, first candidate ≥4.5 wins, and an explicit failure branch (fall back to `--text` + warning). It is a pure, tested function with boundary cases.
9. **MEDIUM — overdue string compare / timezone. ADDRESSED.** The date contract is stated: `given_date`/`deadline` are Postgres `date`, consumed as `YYYY-MM-DD` strings, never through `Date`. Overdue is viewer-local by explicit decision. Unit tests for same-day/one-day-past/no-deadline are specified.
10. **NIT — `lum()` undefined in snippet. ADDRESSED.** The snippet now defines `const lum = (hex) => relativeLuminance(hexToRgb(hex))` and uses it in `contrastRatio`.
11. **NIT — INSERT gated by WITH CHECK. ADDRESSED.** The write policies and the Anonymous Read / Invariants prose now state that `FOR ALL` applies `WITH CHECK` to INSERT and `USING` to UPDATE/DELETE, and that an anon/member INSERT fails the `WITH CHECK`.
12. **NIT — dot badge token unspecified. ADDRESSED.** The pending dot is an `--accent` fill with a 1px `--dot-ring` (= `--text`) ring, so the shape cue survives any accent/tint; `--dot-ring` is in the token contract.
