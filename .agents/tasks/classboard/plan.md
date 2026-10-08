# Implementation Plan — Class To-Do Board

Authoritative design: `.agents/tasks/classboard/design.md`. Review findings folded in: `.agents/tasks/classboard/design-review.md` (4 MEDIUM + 3 NIT). All work happens in the worktree `c:\Users\paulc\Projects\ToDoS\.worktrees\classboard` on branch `classboard`; use absolute paths and `git -C c:\Users\paulc\Projects\ToDoS\.worktrees\classboard` for every git command (step cwd is the parent workspace, not the worktree). Commit locally; never push. Do NOT seed schedule/subject/task data. The app must be fully usable without login.

Stack (locked): React 18 + TypeScript 5 (strict) + Vite 5, plain CSS variables (NO Tailwind), `@supabase/supabase-js` v2, DM Sans. Components consume only CSS tokens, never hardcoded colors. All write authorization is enforced server-side by RLS; UI hiding is cosmetic only.

Verification commands (run in the worktree): `npm install`, `npm run typecheck` (tsc --noEmit), `npm run lint` (eslint), `npm run test` (vitest run), `npm run build` (tsc -b && vite build). Each item must leave the tree buildable.

- [ ] 1. Scaffold the project in the worktree root (already holds README.md + .gitignore). Create package.json with EXACT pinned versions (react@18, react-dom@18, @supabase/supabase-js@2; dev: vite@5, @vitejs/plugin-react, typescript@5, vitest, @testing-library/react, @testing-library/jest-dom, jsdom, eslint + typescript-eslint + eslint-plugin-react-hooks, esbuild) and scripts dev/build/typecheck/lint/test. Create tsconfig.json (strict) + tsconfig.node.json, index.html (DM Sans via <link> font-display:swap), src/main.tsx, src/App.tsx, eslint config, .env.example (committed placeholders).
      Files: package.json, tsconfig.json, tsconfig.node.json, index.html, src/main.tsx, src/App.tsx, eslint.config.js, .env.example
      Verify: `npm install` succeeds; `npm run typecheck` passes.

- [ ] 2. Write `supabase/migrations/0001_init.sql` with the authoritative DDL from design.md: enums user_role/task_status; tables profiles, subjects, schedule_slots, tasks (exact columns, FKs, `day between 1 and 5` check); SECURITY DEFINER is_officer() and current_role_of(uid) with `set search_path = public`; handle_new_user() + on_auth_user_created trigger; RLS enabled on all four; GRANT select to anon,authenticated on all four; grant insert/update/delete to authenticated on subjects/slots/tasks; add the three data tables to publication supabase_realtime with the replica-identity contract comment.
      Files: supabase/migrations/0001_init.sql
      Verify: read the file end-to-end against design.md's DDL (apply to a live Supabase project in SETUP.md when available).

- [ ] 3. Apply the finding-driven RLS clauses in 0001_init.sql: (fix #1) current_role_of() = independent `select role from public.profiles where id = uid` + SQL comment that the independent READ COMMITTED re-read is the SOLE mechanism (STABLE is only a planner hint); profiles_update_self WITH CHECK role = current_role_of(auth.uid()). (fix #2) NO INSERT policy on profiles + documented comment; do NOT enable FORCE ROW LEVEL SECURITY. (fix #3) revoke the broad profiles update grant and `grant update (role) on public.profiles to authenticated`; Policy A owner self-update writes name/theme_preferences only; Policy B profiles_update_officer for role only. profiles_read/subjects_read/slots_read/tasks_read `for select to anon,authenticated using(true)`; subjects_write/slots_write/tasks_write `for all to authenticated using(is_officer()) with check(is_officer())`.
      Files: supabase/migrations/0001_init.sql
      Verify: read against the fix list; the RLS test gate in item 11 proves it against a real backend.

- [ ] 4. Create the dependency-free pure core `src/lib/theme-core.ts` (no React/Supabase/browser globals at module scope): DEFAULT_PREFS; dark+light base palettes (design.md hexes); hexToRgb, relativeLuminance, lum, contrastRatio, pickReadable, HSL helpers, adjustForAA (2% L step, max 50 iters, darken-light/lighten-dark, fallback --text), resolveTokens(prefs, resolvedMode) emitting the full token set. (fix #5) compute --accent-text ONCE against BOTH --bg and --surface, keep the result passing AA against both, else --text; --focus-ring=--accent-text, --dot-ring=--text, --accent-weak=accent @ ~22% alpha. Create `src/lib/contrast.ts` re-exporting the contrast fns.
      Files: src/lib/theme-core.ts, src/lib/contrast.ts
      Verify: `npm run typecheck` passes; module imports with no React/Supabase/browser deps.

- [ ] 5. Create `src/lib/types.ts` (row + domain types; given_date/deadline as `string | null`; ThemePrefs), `src/lib/sorting.ts` (nearest-deadline-first, nulls last, stable tiebreak over YYYY-MM-DD strings), `src/lib/derive.ts` (subjectHasPending; isOverdue via string compare; localTodayISO using local getters + getMonth()+1 + zero-pad, comment forbidding toISOString()). (fix #6) comment that the glow halo is cosmetic; the ringed dot carries the non-color cue.
      Files: src/lib/types.ts, src/lib/sorting.ts, src/lib/derive.ts
      Verify: `npm run typecheck` passes.

- [ ] 6. Create `src/styles/tokens.css` (:root base palettes selected by `data-mode` on <html>, matching theme-core) and `src/styles/base.css` (resets, DM Sans via --font-sans, :focus-visible via --focus-ring, radius via --radius).
      Files: src/styles/tokens.css, src/styles/base.css
      Verify: `npm run build` succeeds.

- [ ] 7. Create `src/lib/supabase.ts` (reads VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY; `isConfigured`; client with persistSession/autoRefreshToken/detectSessionInUrl; `supabase=null` when unconfigured). Create `src/components/ConfigError.tsx` and `src/components/ErrorBoundary.tsx` styled via live tokens var(--bg)/var(--surface)/var(--text) (fix #7, dark only as bootstrap-failure fallback). App.tsx renders ConfigError when !isConfigured.
      Files: src/lib/supabase.ts, src/components/ConfigError.tsx, src/components/ErrorBoundary.tsx, src/App.tsx
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 8. Create `vite.config.ts` with @vitejs/plugin-react and the pre-paint bootstrap plugin: transformIndexHtml runs `esbuild.build({ entryPoints:['src/lib/theme-core.ts'], bundle:true, format:'iife', globalName:'CBTheme', minify:true, write:false, platform:'browser', target:'es2018' })`, injects the IIFE inline in <head> before the app bundle plus a stub reading localStorage 'cb-theme' (defensive) -> resolve system via matchMedia -> set dataset.mode -> CBTheme.resolveTokens -> setProperty, wrapped in try/catch (default-dark fallback). No Function.prototype.toString().
      Files: vite.config.ts
      Verify: `npm run build`; confirm dist/index.html has the inline bootstrap <script> before the app script.

- [ ] 9. Create `src/context/SessionProvider.tsx` (onAuthStateChange; fetch profiles row for role + theme_preferences; one delayed retry for handle_new_user lag then member default; expose session/profile/role/isOfficer/refreshProfile; data hooks never gate on auth) and `src/data/mutations.ts` (addTask/removeTask/setTaskStatus/upsertSubject/slot writes/setRole — thin RLS-trusting wrappers, no client role check, no optimistic UI).
      Files: src/context/SessionProvider.tsx, src/data/mutations.ts
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 10. Create auth + admin UI: `src/components/AuthDialog.tsx` (email/password + Google OAuth signInWithOAuth, inline errors), `src/components/AdminPanel.tsx` (officers only; promote/demote via setRole; self-demote disabled with tooltip; show name/role only), `src/components/Header.tsx` (title, "Officers can edit" tag, sign-in/profile menu, admin entry, gear/palette entry). All real <button>s with focus rings.
      Files: src/components/AuthDialog.tsx, src/components/AdminPanel.tsx, src/components/Header.tsx
      Verify: `npm run typecheck`, `npm run lint`, `npm run build` pass; add RTL tests (item 15).

- [ ] 11. Author the RLS verification suite (fix #1 + #3 gate). If a live Supabase project is reachable, write integration tests (clearly marked, skipped when env absent); else ship a marked harness + manual steps in SETUP.md. Cases: anon SELECT on all four tables works; anon AND member INSERT/UPDATE/DELETE on tasks rejected; member update({name}) and update({theme_preferences}) succeed; the PURE-ESCALATION case member update({role:'officer'}).eq('id', self) with NO other column change REJECTED; member update({name, role:'officer'}) rejected; officer promote/demote of another user succeeds; officer writing another user's theme_preferences REJECTED (Policy A owner-only).
      Files: src/__tests__/rls.integration.test.ts (or supabase/tests/*), SETUP.md
      Verify: `npm run test` (integration skipped-with-reason when no backend); run against a live project to confirm the negative cases are rejected.

- [ ] 12. Create the data hooks `src/data/useSubjects.ts`, `useScheduleSlots.ts`, `useTasks.ts`: unconditional initial fetch on mount, postgres_changes Realtime channel, reconcile by id (new for INSERT/UPDATE, old for DELETE); status loading/ready/error + retry. (fix #4) poll fallback driven by VITE_REALTIME_FALLBACK and/or channel errored/CLOSED/TIMED_OUT state (NOT an idle timer), 15s poll when active, plus always-on refetch on window focus/visibilitychange.
      Files: src/data/useSubjects.ts, src/data/useScheduleSlots.ts, src/data/useTasks.ts
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 13. Create the board UI: `src/components/ScheduleGrid.tsx` + `ScheduleCell.tsx` (Mon–Fri cols, time-block rows, each subject a real <button> name+room, derived glow = amber border + --accent/--accent-weak halo + ringed dot (--accent fill + --dot-ring=--text ring), click selects; empty state), `src/components/DetailsPanel.tsx` (selected subject's pending tasks only, sorted, overdue flagged with --danger, empty states, clear selection on realtime delete), `src/components/TaskList.tsx` + `TaskRow.tsx` ("Subject - Task" + dates, nearest-deadline-first, overdue flag, officer-only Add/remove/status absent for members+anon), `src/components/AddTaskDialog.tsx` (validated fields; mutations.addTask; no optimistic UI), `src/components/Layout.tsx` (selectedSubjectId state; desktop 70/30 grid).
      Files: src/components/ScheduleGrid.tsx, src/components/ScheduleCell.tsx, src/components/DetailsPanel.tsx, src/components/TaskList.tsx, src/components/TaskRow.tsx, src/components/AddTaskDialog.tsx, src/components/Layout.tsx
      Verify: `npm run typecheck`, `npm run lint`, `npm run build` pass.

- [ ] 14. Create the theme runtime: `src/lib/theme.ts` (apply tokens, resolve system, localStorage cb-theme read/write matching the bootstrap shape), `src/context/ThemeProvider.tsx` (hydrate from profile.theme_preferences > localStorage > DEFAULT_PREFS; always write localStorage; logged-in also persist to profiles.theme_preferences via Policy A; DB wins on login then sync; anon localStorage-only; system matchMedia live), `src/components/AppearancePanel.tsx` (mode, accent picker+presets, bg/surface tints, Reset to default, hex validation) + `src/components/ContrastWarning.tsx` (accent-text fallback warning; tint-vs-text AA warn + discard-tint).
      Files: src/lib/theme.ts, src/context/ThemeProvider.tsx, src/components/AppearancePanel.tsx, src/components/ContrastWarning.tsx
      Verify: `npm run typecheck`, `npm run lint`, `npm run build` pass; refresh keeps theme with no flash.

- [ ] 15. Add the test suite. Unit: contrast (WCAG reference pairs; pickReadable; adjustForAA pass/darken/exhaust-to-text; fix #5 accent-text vs both bg+surface), resolveTokens (dark/light maps, accent overlay, tint overlay, mode-switch preserves accent), default-palette AA assertions (criterion 5), sorting (dated-before-undated/nearest/undated-last/stable), derive (subjectHasPending; isOverdue same-day/one-day-past/no-deadline; localTodayISO zero-pad + local-not-UTC). Parity test: eval the actual esbuild IIFE in jsdom/VM, assert byte-identical maps vs runtime resolveTokens. RTL: ScheduleCell is a real focusable <button> with ringed dot; officer-only controls present for officer, absent for member+anon; ConfigError when unconfigured; AdminPanel self-demote disabled.
      Files: src/lib/*.test.ts, src/components/*.test.tsx, src/__tests__/*
      Verify: `npm run test` — all pass.

- [ ] 16. Responsive + accessibility pass: mobile breakpoint stacks schedule -> details -> list, ScheduleGrid overflow-x:auto; audit that every interactive element is a real <button>/input with visible :focus-visible via --focus-ring and proper ARIA (aria-pressed on selected cell, dialog role/aria-modal/focus-trap/Escape, pending dot aria-hidden with text alt). Confirm no hardcoded colors anywhere.
      Files: src/components/Layout.tsx, src/styles/*.css, affected components
      Verify: `npm run test` + `npm run build` pass; manual tab-through shows focus on every control; mobile stack + horizontal schedule scroll confirmed.

- [ ] 17. Finalize SETUP.md + README.md: env + .env.example, Google OAuth setup, officer-bootstrap SQL, anon-Realtime verification (INSERT/UPDATE/DELETE + replica-identity one-liner), VITE_REALTIME_FALLBACK guidance, current_role_of coupling note, full RLS proof curls/manual steps, quickstart. Then a clean full verification: `npm install && npm run typecheck && npm run lint && npm run test && npm run build` all green; clean up temp files.
      Files: SETUP.md, README.md
      Verify: the full command chain passes with no errors in the worktree.

## Test list (summary)
- WCAG math: relativeLuminance/contrastRatio reference pairs; pickReadable; adjustForAA (unchanged / darken-to-pass / exhaust-to-text); fix #5 accent-text against both bg+surface.
- Theme: resolveTokens maps; mode-switch preserves accent; default dark+light palettes meet AA; esbuild bootstrap parity (byte-identical, real IIFE).
- Glow/derive: subjectHasPending toggle; isOverdue same-day/one-day-past/no-deadline; localTodayISO zero-pad + local-vs-UTC.
- Sorting: dated-before-undated, nearest-first, nulls-last, stable tiebreak.
- RLS (live or documented manual): anon read ok; anon/member writes rejected; member name/theme self-update ok; PURE role-only self-escalation rejected; officer role change ok; officer cross-user theme write rejected.
- Component (RTL): ScheduleCell real focusable button + ringed dot; officer-only controls present/absent by role incl. anon; ConfigError when unconfigured; AdminPanel self-demote disabled; dialog keyboard behavior.
