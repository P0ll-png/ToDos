# Absence evidence link — change summary

Replaced the absence **file-attachment** subsystem with a single optional
**evidence link** (any URL, e.g. a Google Drive share link) stored directly on
the absence request. No file uploads, no storage buckets, no signed URLs in the
absence flow anymore. The link's visibility follows the request's existing
privacy rule (`ar_select`: `user_id = auth.uid() or public.is_officer()`) —
readable by the owner and officers only.

## What changed

Schema (new forward migration — `0003` is already applied, `0004` is append-only):
- `supabase/migrations/0004_absence_evidence_url.sql` (new):
  - adds nullable `evidence_url text` to `public.absence_requests` with a
    permissive `check (evidence_url is null or evidence_url ~* '^https?://')`
    backstop;
  - drops the four `excuse-attachments` `storage.objects` policies
    (`ea_insert`, `ea_select_own`, `ea_select_officer`, `ea_delete_own`);
  - drops `public.absence_attachments` with CASCADE (removes its `aa_*` policies
    and grants);
  - documents that the `excuse-attachments` **bucket** row must be deleted
    manually in the dashboard; the `reviewers` bucket/table/policies are left
    intact.

Types (`src/lib/types.ts`):
- added `evidence_url: string | null` to `AbsenceRequestRow` and
  `evidenceUrl: string | null` to the `AbsenceRequest` domain type;
- removed the `AbsenceAttachmentRow` / `AbsenceAttachment` interfaces.

Data layer:
- `src/data/mutations.ts`: `createAbsenceRequest` now writes `evidence_url`
  (member-owned field only, preserving the `ar_insert` WITH CHECK invariant);
  removed `addAbsenceAttachment` and `UploadAttachmentInput`; updated doc
  comments. Kept the shared `signedUrlFor` / `SIGNED_URL_MESSAGES` (Reviewers).
- `src/data/useAbsenceRequests.ts`: `rowToRequest` maps `evidenceUrl` (both
  member and officer modes already select `*`).
- `src/lib/storage.ts`: removed the absence-only `EXCUSE_MIME` / `EXCUSE_MAX`;
  kept all Reviewers helpers (`validateFile`, `sanitizeFileName`,
  `buildStoragePath`, `REVIEWER_MIME`, `REVIEWER_MAX`, `SIGNED_URL_TTL_SECONDS`).

Components:
- `src/components/AbsenceForm.tsx`: removed the file input / upload UI /
  per-file indicator / 3-files-PDF/JPG/PNG/5MB validation and the upload loop;
  added an optional "Evidence link" `<input type="url">` with light client
  validation (trim; empty → omitted; otherwise must start with `http(s)://`);
  reworded the privacy notice to "Your evidence link is visible only to you and
  class officers."
- `src/components/OfficerAbsenceInbox.tsx`: removed attachment loading / signed
  URL preview / "Save a copy"; renders each request's `evidenceUrl` as a safe
  external anchor (`target="_blank" rel="noopener noreferrer"`) when present.
- `src/components/MyAbsenceList.tsx`: owner sees their own `evidenceUrl` as a
  safe external anchor when present.

Tests / docs / scripts:
- `src/lib/storage.test.ts`: retargeted the `validateFile` cases to
  `REVIEWER_MIME` / `REVIEWER_MAX`.
- `src/__tests__/rls.integration.test.ts`: removed the attachment / storage
  signed-URL cases and `RLS_TEST_ABSENCE_ATTACHMENT_ID`; kept and extended the
  owner-vs-officer read-isolation case to cover `evidence_url` (owner + officer
  read the column; a second member still gets no row). Still skips-with-reason
  when env is unset.
- `SETUP.md`: removed the `excuse-attachments` bucket step and the attachment
  `RLS_TEST_*` var / curl cases; noted applying `0004` as the only DB step and
  that the `excuse-attachments` bucket can be deleted from the dashboard.
  Reviewers docs kept.
- `scripts/seed-rls-fixtures.mjs`: stopped seeding an `absence_attachments` row;
  now sets an `evidence_url` on the seeded pending request; dropped the
  `RLS_TEST_ABSENCE_ATTACHMENT_ID` output.
- `.env.test.local.example`: dropped the attachment var.

## One-step DB instruction

1. Apply `supabase/migrations/0004_absence_evidence_url.sql` (SQL editor or
   `supabase db push`).
2. (Optional cleanup) Delete the `excuse-attachments` bucket in the Supabase
   dashboard (Storage → Buckets). The `reviewers` bucket must be left intact.

No other DB changes are needed.
