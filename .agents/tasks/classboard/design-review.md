# Design Review — Class To-Do Board (round 3)

Reviewed: `.agents/tasks/classboard/design.md`
Reviewer context: fresh read, no implementation exists yet (greenfield). The only source artifacts in the repo are two `.gitignore` files and the prior `design-verdict.json`; there is no application code to diff the design against, so "verify against source" here means verifying the design's claims against documented Postgres / Supabase / WCAG / esbuild behavior.

## Summary

This is a mature, round-3 design that has already absorbed two prior review passes. The architecture is coherent end-to-end: anonymous public read is correctly modeled as GRANT + permissive SELECT policy to `anon`; writes are officer-gated at the DB; glow is genuinely derived; the WCAG math is a real relative-luminance computation; the no-flash bootstrap has a concrete esbuild-bundle mechanism; and the token architecture cleanly separates accent-as-fill from accent-as-text.

Most of the heavy correctness reasoning holds up. The findings below are the residual gaps a fresh read surfaces — one of them (the `current_role_of` / `WITH CHECK` snapshot behavior) is the load-bearing security claim of the whole role model and deserves a hard, test-backed confirmation rather than prose confidence, because the design's own prose contains an internal inconsistency about *which* row the function reads.

---

## Findings

### 1. MEDIUM — The `current_role_of()` snapshot argument is internally inconsistent and the security conclusion is asserted, not proven

**Where:** "Why `current_role_of()` instead of an inline same-table subquery"; "Profiles UPDATE Policy Composition".

**Problem:** This is the single most important security claim in the design: that a member cannot self-escalate because `profiles_update_self`'s `WITH CHECK (role = current_role_of(auth.uid()))` compares the *new* role against the *committed old* role. The design justifies the "reads old role" behavior by appealing to "MVCC statement-snapshot visibility under READ COMMITTED," asserting the `SECURITY DEFINER` `SELECT` sees the committed pre-UPDATE row, not the in-flight tuple.

That conclusion is correct for Postgres, but the design's reasoning conflates two separate mechanisms and never states the one that actually makes it safe. `WITH CHECK` is evaluated against the **proposed new row** for the row being written. The reason `current_role_of()` returns the OLD role is **not** general "statement-snapshot visibility" — it is that `current_role_of()` runs a *fresh independent SELECT* against `public.profiles` by `id`, and that SELECT, under READ COMMITTED, uses the query's own snapshot which does not include the uncommitted in-flight UPDATE being validated. The design actually says this in one sentence, then undercuts it: it also says the function "sees the committed, pre-UPDATE profiles row — it does not see the in-flight new tuple produced by the same UPDATE." A reader cannot tell whether the guarantee rests on isolation level, on the DEFINER re-read, or on `STABLE` planner folding — the doc invokes all three and disclaims two.

The practical risk: this is exactly the kind of reasoning that is "probably right" but where being wrong means silent privilege escalation. If, in the running Postgres/Supabase version, the self-referential re-read inside `WITH CHECK` ever observed the new tuple (e.g. a future refactor to a correlated subquery, or a different isolation level), a member could set `role='officer'` on their own row and pass the check.

**Fix:** Keep the function, but make the integration test the authoritative guarantee and tighten the prose to one unambiguous mechanism. Concretely:
- State plainly: "`current_role_of()` performs an independent `SELECT ... WHERE id = auth.uid()` that, under READ COMMITTED, does not see the uncommitted row produced by the enclosing UPDATE; therefore it returns the committed (old) role. This is the sole mechanism; `STABLE` is only a planner hint and is not relied on for correctness."
- Promote the RLS integration test from "the authoritative guarantee" prose to a **required, must-pass gate** before any officer feature ships, and add an explicit negative case to it: a member issuing `update({ role: 'officer' }).eq('id', <self>)` with NO other column change (the pure-escalation attempt) must be rejected. The current test list only shows `update({name, role:'officer'})`; add the role-only variant so the test cannot pass just because `name` tripped some other guard.

### 2. MEDIUM — `handle_new_user` writes `profiles` but no INSERT policy / insert grant exists for that path, and the trigger's RLS interaction is unstated

**Where:** DDL — `handle_new_user` trigger; table-level privileges; profiles policies.

**Problem:** The DDL enables RLS on `public.profiles` and defines only SELECT and UPDATE policies. There is **no INSERT policy on `profiles`**, and `insert` is not granted on `profiles` to any role (only `update` is granted to `authenticated`). New rows are created exclusively by the `handle_new_user` trigger, which is `SECURITY DEFINER`. The design never states *why* that INSERT succeeds despite RLS being enabled and no INSERT policy existing.

It does work — but for a specific reason that must be documented so an implementer doesn't "fix" it or get blocked debugging it: the trigger function is `SECURITY DEFINER` owned by a superuser/table-owner role, and in Postgres the table owner **bypasses RLS by default** (unless `FORCE ROW LEVEL SECURITY` is set). So the definer insert is not subject to the (nonexistent) INSERT policy. If an implementer adds `alter table public.profiles force row level security;` (a reasonable hardening instinct), every signup would start failing with an RLS violation because no INSERT policy admits the row.

**Fix:** Add one sentence to Security Notes / the DDL comment block: "`profiles` has no INSERT policy by design; rows are created only by the `SECURITY DEFINER` `handle_new_user` trigger, which runs as the table owner and bypasses RLS. Do **not** add `FORCE ROW LEVEL SECURITY` to `profiles` without also adding an INSERT policy, or signup will break." Optionally, make it explicit and self-documenting by adding a restrictive INSERT policy keyed to the trigger instead of relying on owner-bypass.

### 3. MEDIUM — The `profiles_update_officer` USING clause lets an officer edit *any* profile's `theme_preferences`, contradicting the per-user theme invariant

**Where:** profiles policies (Policy B); "Theme Persistence" ("never anyone else's"); acceptance criterion (4).

**Problem:** Policy B is `for update to authenticated using (is_officer()) with check (is_officer())` with no column scoping and no `id` restriction. That grants an officer UPDATE on **every column of every profile row**, including other users' `theme_preferences`. The design states as an invariant that "theme changes only ever touch the current user's ... profile row — never anyone else's" and criterion (4) requires theme changes to affect only the current user. The client never *intends* to do this, but the design's own threat model is "do not rely on the UI; the DB is the boundary." Under that model, an officer calling the API directly can overwrite any member's stored theme, which violates the stated invariant at the only layer the design says counts.

This is lower-stakes than role escalation (an officer is already trusted), but it is a genuine conflict between a stated server-side invariant and the actual policy surface, and the design explicitly promised the DB — not the UI — enforces theme isolation.

**Fix:** Either (a) narrow the stated invariant to "the *client* only ever writes the current user's theme; officers technically can overwrite any profile via Policy B, which is accepted because officers are trusted" — i.e. downgrade the invariant to match reality and say so; or (b) scope Policy B to the columns officers actually need (`role`, and perhaps `name`) using a column-level grant (`grant update (role) on public.profiles to authenticated` combined with revoking the broad update grant), so `theme_preferences` can only be written by the row owner via Policy A. Option (b) is the stronger match for the design's "DB is the boundary" stance. Pick one explicitly.

### 4. MEDIUM — Realtime delivers UPDATE/DELETE events to `anon` only if Realtime RLS authorization is satisfied, and the design's own fallback detection is underspecified in a way that can mask a permanent failure

**Where:** "Anon Realtime delivery is a verified prerequisite, with a fallback"; Error Handling (Realtime subscribe row).

**Problem:** The design correctly identifies that anon Realtime delivery is not guaranteed and provides a poll fallback — good. But the fallback *trigger* is described two different ways: "a `REALTIME_FALLBACK` flag (env or a runtime check that detects no events arriving within N seconds of subscribing)." A runtime "no events within N seconds" detector cannot distinguish "Realtime is broken for anon" from "nobody has changed any data in N seconds" — the normal idle case. If implemented naively, either (a) it never trips because the subscribe succeeds (CHANNEL state = joined) even though no row events will ever be authorized for anon, or (b) it trips constantly on an idle board and forces polling for everyone. Neither is specified tightly enough to implement correctly, and the "subscribe succeeded but events are silently dropped" case — the actual anon-Realtime failure mode — is the one a naive timer misses entirely.

**Fix:** Specify the detection concretely. Recommended: do not rely on a runtime idle timer. Make the fallback a deterministic configuration decision validated by the SETUP.md verification step: if the documented anon-Realtime verification fails for the target project, set `VITE_REALTIME_FALLBACK=1` (or detect the channel entering an errored/`CLOSED`/`TIMED_OUT` state, which is observable, rather than inferring from event silence). State that "no events for N seconds" alone is NOT a valid trigger because it is indistinguishable from an idle board. Also add a lightweight always-on reconciliation (refetch on window `focus`/`visibilitychange`) so a missed event self-heals regardless of transport.

### 5. NIT — `adjustForAA` targets `--surface` but the "stricter of --bg and --surface" rule is described loosely and left optional

**Where:** "Auto-adjust algorithm" step 2.

**Problem:** The algorithm fixes the comparison target as `--surface`, then adds that where links also appear on `--bg`, "implementers pass `--bg` and the panel takes the stricter of the two ... but the default and tested target is `--surface`." Links in the right-hand `TaskList` and `DetailsPanel` sit on cards (`--surface`), but the design elsewhere allows accent-colored labels and the "Officers can edit" tag, some of which may sit on `--bg`. "Takes the stricter of the two by calling adjustForAA against each and keeping the one with the lower passing lightness delta" is hand-described and not pinned to a single `--accent-text` value, which risks two different computed link colors.

**Fix:** Decide one rule and specify it: compute `--accent-text` once against the surface with the **higher** luminance distance requirement (i.e. run `adjustForAA` against both `--bg` and `--surface` and keep the result that satisfies AA against *both*; if only one can be satisfied, fall back to `--text`). Make that single resolved value the token, and unit-test it. Drop the "optional / implementers pass --bg" phrasing.

### 6. NIT — `--accent-weak` at "~22% alpha" is used as the glow halo but never contrast-validated, and the non-color pending cue depends on it being visible

**Where:** Token set (`--accent-weak`); "Pending/glow indicator is not color-alone".

**Problem:** The glow halo uses `--accent-weak` (accent at ~22% alpha). The design satisfies the color-alone WCAG concern via the dot's `--dot-ring` (= `--text`), which is sound. But the halo's own visibility against a tinted `--bg`/`--surface` is never checked; "~22%" is an eyeballed constant. This is a NIT because the dot (not the halo) is the accessibility guarantee, so a weak halo degrades aesthetics, not compliance.

**Fix:** Note explicitly that halo visibility is a cosmetic, not accessibility, property (the dot carries the non-color cue), so no contrast check is required on `--accent-weak`. That one sentence closes the question without adding code.

### 7. NIT — Error-boundary and `ConfigError` use "default dark palette tokens," but a user whose stored preference is light will see a dark error screen

**Where:** "Supabase Client & Graceful Degradation" (`ConfigError` uses default dark palette); Error Handling (top-level error boundary renders using tokens).

**Problem:** `ConfigError` renders before any Supabase/profile load, so it reasonably uses defaults — but hardcoding *dark* means a returning user who set light mode (persisted in `localStorage`, which the pre-paint bootstrap already read and applied to `document.documentElement`) gets a jarring dark error card. Since the pre-paint bootstrap runs even on the config-error path (it is in `index.html` before the app bundle), the correct tokens are already on `:root`.

**Fix:** Have `ConfigError` and the error boundary consume the live CSS tokens already applied by the bootstrap (`var(--bg)`, `var(--surface)`, `var(--text)`) rather than hardcoding the dark palette. Falls back to dark automatically only if the bootstrap failed. One-line clarification in the component description.

---

## Verified Assumptions

These claims in the design were checked against documented Postgres / Supabase / WCAG / esbuild behavior and are **correct as stated**:

- **GRANT + permissive SELECT policy both required for anon read.** Postgres checks table privileges before RLS; `grant select ... to anon` plus a `for select to anon using (true)` policy is the correct and complete recipe. The design states both halves and why. Correct.
- **`is_officer()` as `SECURITY DEFINER` breaks RLS recursion on `profiles`.** A policy on `profiles` that calls a function which SELECTs `profiles` would recurse (42P17) under `SECURITY INVOKER`; `SECURITY DEFINER` makes the internal SELECT bypass RLS and breaks the cycle. `set search_path = public` correctly guards against definer-privilege hijack. Correct and important.
- **Multiple permissive policies compose with OR.** The design's four-case truth table for the two profiles UPDATE policies is accurate: a write passes if any permissive policy's `WITH CHECK` admits it, and member self-escalation fails *both* policies' `WITH CHECK`. Correct.
- **`FOR ALL` applies `WITH CHECK` to INSERT and `USING` to UPDATE/DELETE.** The write-policy reasoning (anon/member INSERT fails `WITH CHECK`, UPDATE/DELETE fails `USING`) matches Postgres semantics. Correct.
- **Anon has no write grant → defense in depth.** Writes granted only to `authenticated`; anon write denied at privilege layer before policy evaluation. Correct.
- **WCAG relative-luminance math.** The `relativeLuminance` (0.03928 threshold, 12.92 divisor, 2.4 gamma, 0.2126/0.7152/0.0722 coefficients) and `contrastRatio` ((L1+0.05)/(L2+0.05)) are the exact WCAG 2.x formulas. This is a real computation, not eyeballed. Correct.
- **`pickReadable` (black vs white, higher ratio) always yields an AA-passing choice in practice.** For `--accent-contrast` on a solid fill this is sound. Correct.
- **`adjustForAA` is bounded and terminating.** 2% L steps, max 50 iterations spanning 0–100 L, deterministic fallback to `--text`. Pure and total. Correct.
- **Default amber `#FFB547` on white ≈ 1.76:1 and resolves to a darkened amber (~#a36100) as `--accent-text` in light mode.** The arithmetic checks out and the design now flags this as intended shipped behavior. Correct and well-documented.
- **Date handling via `YYYY-MM-DD` string compare.** Zero-padded ISO date strings compare correctly with lexicographic `<`; `localTodayISO` using local getters with `getMonth()+1` and padding avoids the UTC/`toISOString()` trap. The viewer-local-timezone overdue decision is explicitly accepted. Correct.
- **esbuild `bundle:true, format:'iife', globalName` captures the transitive dependency graph.** This is the right mechanism to inline `resolveTokens` with all its helpers, and it correctly rejects `Function.prototype.toString()` (which drops transitive deps). The parity test that `eval`s the actual bundle (not a re-derivation) will catch parse-time/identifier regressions. Correct and a solid round-2 fix.
- **Default replica identity suffices because reconciliation keys only on PK.** INSERT/UPDATE `new` payload carries the full row; DELETE `old` carries the PK, which is always present under default identity. Since reconciliation reads only `id`, no `REPLICA IDENTITY FULL` is needed *for reconciliation*. Correct for the stated reconciliation strategy. (The separate delivery-authorization concern is Finding 4.)
- **Glow is derived, never stored.** No `glow` column exists; `subjectHasPending` computes from the live `tasks` array; Realtime keeps it live. Adding/removing/completing a task flips derivation. Correct and matches acceptance criterion (2).

## Unverified / Wrong Assumptions

- **"MVCC statement-snapshot visibility" as the stated mechanism for the role freeze (Finding 1).** The *conclusion* (old role is read) is correct, but the design's stated *reason* is muddled and self-contradicting (invokes isolation level, DEFINER re-read, and `STABLE` while disclaiming two of them). The guarantee rests on the independent re-read under READ COMMITTED, and the design should pin that single mechanism and lean on the integration test. Treated as a MEDIUM, not verified-correct, because the prose as written would mislead a maintainer extending the policy.
- **"No events within N seconds" as a Realtime-failure signal (Finding 4).** This runtime detection cannot distinguish a broken anon-Realtime channel from a merely idle board; the actual failure mode (channel joins successfully but row events are silently unauthorized for anon) is not reliably detectable this way. Not verified; needs a deterministic trigger.
- **`profiles` INSERT under enabled RLS with no INSERT policy (Finding 2).** The design never states why the trigger insert succeeds. It does succeed via `SECURITY DEFINER` owner RLS-bypass, but this is an unstated assumption that becomes wrong the moment anyone adds `FORCE ROW LEVEL SECURITY`. Flagged so it is made explicit.
- **"Theme changes never touch anyone else's row" as a DB-enforced invariant (Finding 3).** False at the DB layer as written: Policy B's unscoped `is_officer()` USING/CHECK lets an officer write any profile's `theme_preferences`. The invariant is true for the *client* but not server-enforced, contradicting the design's own "DB is the boundary" principle.
- **Supabase Google OAuth setup, Realtime publication/authorization defaults, and the officer-bootstrap SQL** are deferred to `SETUP.md`, which does not yet exist in the repo. These are reasonable to defer, but they are currently assumptions, not verified artifacts; the SETUP.md content is load-bearing for criteria (1) and (2) verification.

---

## Verdict

HIGH: 0  MEDIUM: 4  NIT: 3 → **CHANGES_REQUESTED** (any HIGH or MEDIUM blocks).

The design is close and structurally sound; the four MEDIUM findings are tractable and mostly about pinning a mechanism or reconciling a stated invariant with the actual policy surface rather than redesigning anything. Finding 1 (role-freeze mechanism + mandatory negative test) is the one to resolve with the most care, since it guards the core security boundary.
