# VERIFICATION (completed)

Ran from repo root `c:\Users\paulc\Projects\ToDoS`, all clean:

- `npm run typecheck` → `tsc --noEmit` exit 0, **0 errors**.
- `npm run lint` → `eslint src` exit 0, **0 errors, 3 warnings** — all three are
  the pre-existing `react-refresh/only-export-components` warnings on
  NavProvider / SessionProvider / ThemeProvider (baseline per review.json; no new
  warning introduced — `isValidEvidenceUrl` is a module-local, non-exported
  function in AbsenceForm so the file still exports only the component + the
  `PRIVACY_NOTICE` const).
- `npm run build` → `tsc -b && vite build` **OK** (164 modules, built in ~14s).
- `npm run test` → `vitest run`: **20 passed | 1 skipped (21 files)**,
  **168 passed | 17 skipped (185 tests)**. The skipped file is
  `src/__tests__/rls.integration.test.ts`, which **skips-with-reason** locally
  (no live Supabase env) — the expected pass. `storage.test.ts` (now targeting
  `REVIEWER_MIME`/`REVIEWER_MAX`) passes 9/9.

Dead-code sweep (all return NOTHING in `src/`):
`AbsenceAttachment | addAbsenceAttachment | UploadAttachmentInput | EXCUSE_MIME |
EXCUSE_MAX | excuse-attachments | absence_attachments`.

Reviewers feature untouched and still building: `ReviewerCard.tsx` imports
`signedUrlFor`/`SIGNED_URL_MESSAGES`; `ReviewerUploadDialog.tsx` imports
`validateFile`/`buildStoragePath`/`REVIEWER_MIME`/`REVIEWER_MAX` — all still
present in `src/data/mutations.ts` / `src/lib/storage.ts`.

Prior migrations byte-for-byte unchanged:
`git diff --stat supabase/migrations/0001_init.sql 0002_deadline_timestamptz.sql
0003_classboard_ext.sql` → **empty**. All new SQL lives only in
`supabase/migrations/0004_absence_evidence_url.sql`.

ONE-STEP DB INSTRUCTION: apply `supabase/migrations/0004_absence_evidence_url.sql`
(SQL editor or `supabase db push`), then delete the `excuse-attachments` bucket
from the dashboard (Storage → Buckets). The `reviewers` bucket stays.

---

# Implementation Plan — Replace absence file-attachments with a single evidence link

## Context discovered during exploration (read before implementing)

- Project: `classboard` — React 18.3.1 + TypeScript 5.5.4 + Vite 5.4.3 + `@supabase/supabase-js` 2.45.4. Scripts in `package.json`:
  `typecheck` = `tsc --noEmit`, `lint` = `eslint src`, `build` = `tsc -b && vite build`, `test` = `vitest run`, `test:rls` = `node scripts/run-rls-tests.mjs`, `seed:rls` = `node scripts/seed-rls-fixtures.mjs`.
- No AGENTS.md / CONTRIBUTING / `.kiro/steering` exists. The authoritative conventions live in `SETUP.md` and the file-header doc comments: RLS is the only authorization boundary; mutations never check client role; `MutationResult`/`classify` pattern; colors only via theme tokens (`var(--...)`); snake_case Row types + camelCase domain types.
- `0003_classboard_ext.sql` is ALREADY APPLIED to the live DB. We add a NEW forward migration `0004`. Do NOT touch `0001`, `0002`, `0003`.

### Exact 0003 object names relevant to this change (verified by reading 0003)
- Table to drop: `public.absence_attachments` (its RLS policies `aa_select`, `aa_insert`, `aa_delete` and its GRANTs drop with it via CASCADE).
- storage.objects policies 0003 created for the `excuse-attachments` bucket — EXACTLY these four, drop by name:
  `ea_insert`, `ea_select_own`, `ea_select_officer`, `ea_delete_own`.
- Column to add: `public.absence_requests.evidence_url text` (nullable). It rides under the existing `ar_select` policy (`user_id = auth.uid() or public.is_officer()`) — owner-or-officer visibility, exactly what we want. No new policy needed.
- LEAVE INTACT (unrelated — reviewers feature + everything else): the `reviewers` table and `rv_*` / `rv_obj_*` policies, the `reviewers` storage bucket, `events`, `task_completions`, `absence_requests` table and all `ar_*` policies, the realtime publication, replica identity. 0004 must not reference any of these except to ADD the column to `absence_requests`.

### Shared-vs-absence-only helper audit (critical — remove ONLY dead code)
- `signedUrlFor`, `SIGNED_URL_MESSAGES`, `SignedUrlError`, `SignedUrlResult` in `src/data/mutations.ts`: **SHARED** — `src/components/ReviewerCard.tsx` uses them for reviewer downloads. **KEEP.** Only remove the absence CALLERS (in `OfficerAbsenceInbox.tsx`).
- `SIGNED_URL_TTL_SECONDS` in `src/lib/storage.ts`: used by `signedUrlFor`. **KEEP.**
- `validateFile`, `sanitizeFileName`, `buildStoragePath` in `src/lib/storage.ts`: **SHARED** — `src/components/ReviewerUploadDialog.tsx` uses all three. **KEEP.**
- `EXCUSE_MIME`, `EXCUSE_MAX` in `src/lib/storage.ts`: **ABSENCE-ONLY** — used only by `AbsenceForm.tsx` and `src/lib/storage.test.ts`. **REMOVE from storage.ts**; retarget the storage.test.ts cases to `REVIEWER_MIME`/`REVIEWER_MAX` (which stay and are what `validateFile` is still exercised with). `REVIEWER_MIME`/`REVIEWER_MAX` stay — they belong to reviewers.
- `addAbsenceAttachment` + `UploadAttachmentInput` in `src/data/mutations.ts`: absence-only. **REMOVE.**
- `AbsenceAttachment` + `AbsenceAttachmentRow` types in `src/lib/types.ts`: absence-only. **REMOVE.**
- `PRIVACY_NOTICE` export in `AbsenceForm.tsx`: exported but only used in-file, no test. Reword in place (keep the export, it is harmless and keeps the privacy copy a named constant).

Order below is by dependency: SQL first, then types (everything compiles against them), then the pure/data layer, then components, then tests/docs/scripts, then the full verification gate.

---

- [ ] 1. Create the forward migration `supabase/migrations/0004_absence_evidence_url.sql`.
      It must, in this order: (a) `alter table public.absence_requests add column evidence_url text;` (nullable; optionally a permissive CHECK, see note); (b) drop the four excuse-attachments storage policies by their exact 0003 names with `drop policy if exists <name> on storage.objects;` for `ea_insert`, `ea_select_own`, `ea_select_officer`, `ea_delete_own`; (c) `drop table if exists public.absence_attachments cascade;` (this removes its RLS policies `aa_*` and GRANTs); (d) a SQL comment stating the `excuse-attachments` BUCKET row in `storage.buckets` must be deleted manually in the Supabase dashboard (bucket rows are managed outside SQL), and that the `reviewers` bucket/table/policies are UNRELATED and must be left intact. Do NOT reference events, task_completions, reviewers, or any `ar_*`/`rv_*` object except the one ALTER on absence_requests. Keep the optional CHECK permissive, e.g. `constraint absence_evidence_url_http check (evidence_url is null or evidence_url ~* '^https?://')` — allowed to include or omit; client validation is the main gate. Prefer including it as a light backstop consistent with the project's defense-in-depth style.
      Files: `supabase/migrations/0004_absence_evidence_url.sql` (new).
      Verify: `git diff --name-only` shows `0001`/`0002`/`0003` unchanged; the file parses as valid Postgres (reviewed by eye — no local DB to run it). The migration is append-only and is NOT run by the JS build/tests.

- [ ] 2. Update `src/lib/types.ts`: add `evidence_url: string | null;` to `AbsenceRequestRow` and `evidenceUrl: string | null;` to the `AbsenceRequest` domain type (snake→camel per convention, placed near `explanation`). DELETE the `AbsenceAttachmentRow` and `AbsenceAttachment` interfaces and their doc comments.
      Files: `src/lib/types.ts`.
      Verify: `npm run typecheck` — will still report errors in the files that reference the deleted types / new field until items 3–7 land; that is expected mid-sequence. The isolated check is that no OTHER type broke; final green is gated in item 12.

- [ ] 3. Update `src/data/useAbsenceRequests.ts` `rowToRequest` to map `evidenceUrl: row.evidence_url ?? null`. `MEMBER_SELECT='*'` and `OFFICER_SELECT='*, student:...'` already pull the new column via `*`, so no select change is needed; just surface it on the domain object.
      Files: `src/data/useAbsenceRequests.ts`.
      Verify: part of item 12 (`npm run typecheck` + `npm run build`); `rowToRequest` now returns `evidenceUrl` for both member and officer modes.

- [ ] 4. Update `src/data/mutations.ts`: (a) add optional `evidenceUrl?: string | null` to `CreateAbsenceRequestInput`; in `createAbsenceRequest` include `evidence_url: input.evidenceUrl ?? null` in the insert payload (still ONLY member-owned fields — never status/officer/review — so the `ar_insert` WITH CHECK invariant holds). (b) DELETE `UploadAttachmentInput` and `addAbsenceAttachment` entirely. (c) Remove the now-stale references to attachments in the `deleteAbsenceRequest` doc comment and the `CreateAbsenceResult` doc comment (the `id` field STAYS — it is still returned by `createAbsenceRequest`, just no longer used to upload attachments; update the comment to say the id is returned for the caller's convenience / future use). (d) KEEP `signedUrlFor`, `SIGNED_URL_MESSAGES`, `SignedUrlError`, `SignedUrlResult`, and the `SIGNED_URL_TTL_SECONDS` import (ReviewerCard still needs them).
      Files: `src/data/mutations.ts`.
      Verify: part of item 12; grep confirms `addAbsenceAttachment` and `UploadAttachmentInput` no longer exist (`grep -rn "addAbsenceAttachment\|UploadAttachmentInput" src` returns nothing).

- [ ] 5. Update `src/lib/storage.ts`: DELETE `EXCUSE_MIME` and `EXCUSE_MAX` and their comments. KEEP `SIGNED_URL_TTL_SECONDS`, `REVIEWER_MIME`, `REVIEWER_MAX`, `validateFile`, `sanitizeFileName`, `buildStoragePath` (all still used by the Reviewers feature).
      Files: `src/lib/storage.ts`.
      Verify: `grep -rn "EXCUSE_MIME\|EXCUSE_MAX" src` returns nothing after items 6 and 9 also land.

- [ ] 6. Rewrite `src/components/AbsenceForm.tsx` to drop all file-attachment UI/logic and add the evidence-link field. Remove: the `files`/`fileError` state, `onFilesPicked`, `MAX_FILES`, the `<input type="file">` block, the file list + per-file "Uploading…" indicator, the `Spinner` usages tied to uploads (keep a Spinner only if still used by the submit button — it is; keep the submit "Submitting…" spinner), the imports of `EXCUSE_MAX`/`EXCUSE_MIME`/`buildStoragePath`/`validateFile`/`addAbsenceAttachment`, and the attachment upload loop in `handleSubmit`. Add: `evidenceUrl` string state and `evidenceError` state; an optional "Evidence link" `<input type="url">` styled with `inputStyle`; light validation `validateEvidenceUrl` (trim; empty → treat as omitted/null; otherwise must start with `http://` or `https://`, else set inline `evidenceError` with `role="alert"` and `hintError` style). Fold `evidenceError == null` into `canSubmit`. In `handleSubmit`, compute `const trimmed = evidenceUrl.trim(); const link = trimmed === '' ? undefined : trimmed;` and pass `evidenceUrl: link` to `createAbsenceRequest`; after a successful create just `onSubmitted()` and reset the form (no upload loop; the request is complete on insert). Reword `PRIVACY_NOTICE` to `'Your evidence link is visible only to you and class officers.'` and update the file-header doc comment to describe a link field instead of file uploads. Update the field label from "Attachments (optional, up to 3)" to "Evidence link (optional)". Keep all colors as theme tokens and the submit button accessible.
      Files: `src/components/AbsenceForm.tsx`.
      Verify: part of item 12 (`npm run build`, `npm run lint`); manual read confirms no `type="file"` input and no attachment imports remain.

- [ ] 7. Edit `src/components/OfficerAbsenceInbox.tsx` to remove attachment loading/preview and render the evidence link instead. Remove: the `AbsenceAttachment`/`AbsenceAttachmentRow` type imports; the `useEffect` that queries `absence_attachments`; the `attachments`/`attachError`/`fileBusy`/`fileError` state; `openAttachment`; the `supabase` import if it becomes unused (it will — confirm with grep after editing) and the `signedUrlFor`/`SIGNED_URL_MESSAGES` imports (used only by the removed attachment code here); the entire "Attachments:" block and the `attachListStyle`/`linkButtonStyle`/`subtleButtonStyle` style constants if now unused (confirm each is unused before deleting). Add: a small "Evidence:" block that renders `request.evidenceUrl` as a safe external anchor `<a href={request.evidenceUrl} target="_blank" rel="noopener noreferrer">` when non-null, using theme tokens and the global focus ring; render nothing (or a muted "None") when `evidenceUrl` is null — match the surrounding muted-label pattern already used for the old Attachments label. Update the file-header doc comment to describe the link, not signed-URL attachments.
      Files: `src/components/OfficerAbsenceInbox.tsx`.
      Verify: part of item 12; grep confirms no `absence_attachments`/`excuse-attachments`/`signedUrlFor` reference remains in this file.

- [ ] 8. Edit `src/components/MyAbsenceList.tsx` so the owner sees their own link. In `AbsenceRow`, when `request.evidenceUrl` is non-null, render a safe external anchor (`target="_blank" rel="noopener noreferrer"`) labelled e.g. "Evidence link", styled with theme tokens matching the existing row typography; render nothing when null. No new data fetch — `evidenceUrl` is already on the domain object from item 3.
      Files: `src/components/MyAbsenceList.tsx`.
      Verify: part of item 12; manual read confirms the anchor renders only when `evidenceUrl` is set.

- [ ] 9. Update `src/lib/storage.test.ts` to stop importing the removed `EXCUSE_MIME`/`EXCUSE_MAX`. Retarget the four `validateFile` cases to `REVIEWER_MIME`/`REVIEWER_MAX` (import those instead); the type-reject case can use a type not in `REVIEWER_MIME` (e.g. `application/zip`) and the size cases use `REVIEWER_MAX`/`REVIEWER_MAX + 1`. Leave the `sanitizeFileName` and `buildStoragePath` cases unchanged. The intent (type-before-size, boundary at the limit) stays identical.
      Files: `src/lib/storage.test.ts`.
      Verify: `npx vitest run src/lib/storage.test.ts` — all cases pass.

- [ ] 10. Update `src/__tests__/rls.integration.test.ts`: remove the `absence_attachments` + `excuse-attachments` cases and the `ABSENCE_ATTACHMENT_ID` plumbing. Specifically: drop `ABSENCE_ATTACHMENT_ID` and remove it from `extConfigured` and the skip-reason message (keep `MEMBER2_*` and `ABSENCE_REQUEST_ID`); remove `absence_attachments` from the anon-denied table loop; delete the tests "a SECOND member is denied the attachment ROW, a guessed storage PATH; officer reads both", the three `ea_insert` upload tests, and the `aa_delete`/`ea_delete_own` pending-only test, plus the `seededStoragePath` lookup in `beforeAll`. KEEP and extend the owner-vs-officer request read-isolation test: keep "member reads OWN absence request; a SECOND member is denied it", and add assertions that `evidence_url` is returned to the owner and to the officer but the second member still gets `null` (no row). Keep the reviewers (AC11/AC12), events, task_completions, and pending-count cases intact. The suite must still skip-with-reason when env is unset.
      Files: `src/__tests__/rls.integration.test.ts`.
      Verify: `npx vitest run src/__tests__/rls.integration.test.ts` — suite reports SKIPPED-with-reason locally (no live env), which is a pass. Final full run in item 12.

- [ ] 11. Update docs, template, and seed script.
      (a) `SETUP.md`: in section 2a remove the `excuse-attachments` row from the bucket table and any instruction to create that bucket; keep the `reviewers` bucket intact. Note that applying `0004` is the only DB step for this change and that the `excuse-attachments` bucket can be deleted from the dashboard. In section 7 remove the `RLS_TEST_ABSENCE_ATTACHMENT_ID` var from the automated-run env list, drop the attachment-specific curl cases (the guessed-signed-URL case, the `ea_insert` upload curls, the attachment-row delete curl, and `ATT_ID`/`ATT_PATH` vars), and keep the absence_requests owner-vs-officer and pending-count curls; update prose that referenced "attachment" to "evidence link". Keep all reviewers docs.
      (b) `.env.test.local.example`: delete the `RLS_TEST_ABSENCE_ATTACHMENT_ID` line and the sentence telling the reader to file a request "with an attachment" (change to filing a pending request, optionally with an evidence link). Keep `RLS_TEST_ABSENCE_REQUEST_ID` and `RLS_TEST_MEMBER2_*`.
      (c) `scripts/seed-rls-fixtures.mjs`: delete step 4 (the `absence_attachments` lookup/insert) and the `attachmentId` variable; when creating the pending `absence_requests` row (step 3), also set `evidence_url: 'https://drive.google.com/file/d/EXAMPLE/view'` (and when reusing an existing pending request, update it to set that `evidence_url` if null so the seeded fixture always has one); remove the `RLS_TEST_ABSENCE_ATTACHMENT_ID=...` line from the printed output. Keep the 3 accounts, officer promotion, and the single pending request owned by member1.
      Files: `SETUP.md`, `.env.test.local.example`, `scripts/seed-rls-fixtures.mjs`.
      Verify: `grep -rn "ABSENCE_ATTACHMENT_ID\|absence_attachments\|excuse-attachments" SETUP.md .env.test.local.example scripts` returns nothing; `node --check scripts/seed-rls-fixtures.mjs` parses cleanly (it is a module — if `--check` complains about ESM, a successful `npm run build` + eyeball is sufficient since the script is not invoked in CI).

- [ ] 12. Full verification gate from repo root `c:\Users\paulc\Projects\ToDoS`. Run and require clean, in order: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test`. The RLS integration suite must report SKIPPED-with-reason locally (expected pass); `storage.test.ts` and all other unit tests must pass. Then run the dead-code sweep: `grep -rn "AbsenceAttachment\|addAbsenceAttachment\|UploadAttachmentInput\|EXCUSE_MIME\|EXCUSE_MAX\|excuse-attachments\|absence_attachments" src` must return NOTHING (every absence-attachment reference gone); and confirm no dangling import of a removed symbol anywhere (`npm run build` would already fail on one, this grep is the belt-and-suspenders). Confirm `signedUrlFor`/`validateFile`/`buildStoragePath`/`sanitizeFileName`/`REVIEWER_MIME`/`REVIEWER_MAX` still exist and are still imported by `ReviewerCard.tsx`/`ReviewerUploadDialog.tsx` (Reviewers untouched and building). Confirm `git diff --stat supabase/migrations/0001_init.sql supabase/migrations/0002_deadline_timestamptz.sql supabase/migrations/0003_classboard_ext.sql` is empty (byte-for-byte unchanged) and all new SQL lives only in `0004_absence_evidence_url.sql`.
      Files: none (verification only).
      Verify: all four npm scripts exit 0; the grep sweep is empty; the three prior migrations show no diff.

## Notes / assumptions
- The optional DB CHECK on `evidence_url` is included as a light `http(s)` backstop (item 1); it is permissive and matches the client gate. If a reviewer objects to any DB CHECK, it may be dropped without affecting the feature — client validation is the primary gate.
- `createAbsenceRequest` still returns the new row `id`; it is simply no longer consumed for uploads. Keeping it avoids a wider signature change and leaves the member-owned-fields-only invariant intact.
- No AbsenceForm component test exists, so the form change is covered by typecheck/lint/build plus the behavioral RLS/doc updates; the pure URL-trim/validate logic is simple enough to live inline in the form. If a reviewer wants it unit-tested, extract `validateEvidenceUrl` into `src/lib` and add a small test — optional, not required by the verification contract.
