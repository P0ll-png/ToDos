# Class To-Do Board

A shared to-do and schedule tracker for one class. Officers manage tasks and subjects; everyone can view the schedule and task list.

Tech: React + TypeScript + Vite, Supabase (auth + database with row-level security), CSS variable design tokens for per-user theming.

## Getting started

1. Copy `.env.example` to `.env` and fill in your Supabase project URL and anon
   key.
2. Apply `supabase/migrations/0001_init.sql` to your Supabase project.
3. Install and run:

   ```
   npm install
   npm run dev
   ```

See [SETUP.md](./SETUP.md) for the full guide: environment variables, Google
OAuth, promoting the first Officer, Realtime verification, and RLS proofs.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build (`tsc -b && vite build`)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `eslint src`
- `npm run test` — run the Vitest unit suite

## Architecture notes

- All write authorization is enforced server-side by Supabase RLS. The UI hides
  Officer controls as a convenience only, never as a security boundary.
- The app is fully usable without logging in: anonymous visitors get public read
  access to the schedule, subject details, and task list.
- Pure domain logic (theme/contrast math, task sorting, glow derivation) lives in
  `src/lib/` with no React/Supabase dependencies, so it is directly unit-tested.
- Theming uses CSS custom properties (design tokens). Components consume only
  tokens — never hardcoded colors (the modal backdrop uses a `--scrim` token).
  A build-time pre-paint bootstrap applies the user's theme before first paint
  to avoid a flash of the wrong theme.
- Layout is responsive: a 70% / 30% desktop grid that collapses to a single
  column at <= 860px, stacking schedule -> details -> list. The schedule grid
  scrolls horizontally on narrow screens.
- Accessibility: every interactive element is a real `<button>`/input with a
  visible `:focus-visible` ring (`--focus-ring`). Dialogs share a `Modal`
  component that provides `role="dialog"` + `aria-modal`, a focus trap,
  Escape-to-close, and focus restoration to the opener. The schedule's "pending"
  state is conveyed by a ringed dot plus screen-reader text, not color alone.
