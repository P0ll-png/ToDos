# Design Review — Class To-Do Board Extension (classboard-ext)

Reviewer: design-review subagent (fresh read, no prior-context assumptions)
Design under review: `.agents/tasks/classboard-ext/design.md`
Requirements: `.agents/tasks/classboard-ext/requirements.md`
Prior review: `.agents/tasks/classboard-ext/design-review.md` (this file, now overwritten) raised 1 HIGH + 2 MEDIUM.

Scope of this pass: a focused confirmation that the three previously-blocking fixes (F1/F2/F3) landed in `design.md` and are unambiguous. The locked decisions — indeterminate upload indicator (not XHR progress), the RLS/storage/realtime model, `is_officer()` reuse, and the 0003-only migration — are NOT reopened. Wording clarity only.

---

## Verdict summary

All three required fixes are present in `design.md` and are stated clearly and specifically. No new HIGH or MEDIUM wording problems were found. Two carried-over NITs remain as NITs (they do not block).

**Verdict: APPROVED** (0 HIGH, 0 MEDIUM, 2 NIT).

---

## Confirmation of the three required fixes

### F1 — Upload "progress" reframed to an indeterminate indicator — CONFIRMED (clear)

The design now reframes upload feedback as an **indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)** in every one of the four required locations, each carrying the explicit scope sentence that byte-percent progress is out of scope because `@supabase/storage-js` 2.45.4 `upload()` is `fetch()`-based and its `FileOptions` has no progress callback:

- **OD-5** (Download UX / Signed-URL flow): the narrative rejects the `createSignedUploadUrl` + XHR percentage path and the Error-handling section states the indeterminate indicator is "the chosen mechanism (lowest risk, no new dependency … `createSignedUploadUrl` + XHR is explicitly not used)."
- **Error handling → File upload (absences/reviewers):** "During the in-flight upload the UI shows an **indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)**, not a percentage bar: byte-percent progress is explicitly out of scope because `@supabase/storage-js` 2.45.4 `upload()` is `fetch()`-based and its `FileOptions` exposes no progress callback."
- **`AbsenceForm`:** "a per-file **indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)** … Byte-percent progress is explicitly out of scope because `@supabase/storage-js` 2.45.4 `upload()` is `fetch()`-based and its `FileOptions` has no progress callback."
- **`ReviewerUploadDialog`:** identical "**indeterminate upload indicator (spinner + "Uploading…" state, disabled submit)**" wording plus the same out-of-scope sentence.

Consistent phrasing across all four sites; no residual "show progress" / "with progress" promise remains in the component or error-handling specs. Unambiguous.

### F2 — `profiles` embeds select `name` only — CONFIRMED (clear)

The Data layer section opens with a bolded, mandatory rule: "**Profiles-embed rule (privacy — mandatory):** every `profiles` embed on the Absences and Reviewers pages selects **`name` only** — `student:profiles!absence_requests_user_id_fkey(name)` for the officer absence inbox and `uploader:profiles!..._fkey(name)` for reviewer cards — **never** `profiles(*)` and **never** `email`." It gives the reason (`profiles_read` is `using(true)` for `anon`/`authenticated` and therefore also exposes `email`, per 0001's own comment) and states the rule exists so an implementer keeps `name`-only everywhere a profile is embedded on these pages. The concrete embeds in `useAbsenceRequests` and the reviewer card lookup both select only `name`, matching the rule. Unambiguous.

### F3 — Per-published-table anon realtime delivery outcome in OD-4 — CONFIRMED (clear)

OD-4 contains an explicit block, "**Per-role delivery outcome for every published table**," with one line per published table stating the anon outcome:

- `events` → an **anon** subscriber **receives changes** (public, intended); authenticated subscribers also receive them.
- `task_completions` → an **anon** subscriber has **no grant and no policy**, so it **receives nothing**; only the owning authenticated subscriber receives their own rows.
- `reviewers` → an **anon** subscriber has **no grant and no policy**, so it **receives nothing**; only authenticated subscribers get rows.
- `absence_requests` / `absence_attachments` → not in the publication at all, so no subscriber of any role receives streamed changes.

The three required outcomes (events → anon receives; task_completions → anon receives nothing; reviewers → anon receives nothing) are each stated verbatim. Unambiguous.

---

## Findings

### 1. NIT — Size-limit lockstep is noted but relies on a human-maintained comment

**Where:** `absence_attachments.attach_size` / `reviewers.reviewer_size` DB CHECKs vs the manual bucket `file_size_limit` (SETUP.md); the "Size-limit coupling (NIT4)" note.

**Problem:** The design now correctly documents that the DB CHECK and the bucket `file_size_limit` are two independent server-side enforcers that "must be kept in lockstep (a comment in each should reference the other)," and that the bucket limit is the authoritative byte cap while the CHECK guards the self-reported `size_bytes` metadata. This is adequate wording; the only residual risk is that lockstep depends on a cross-referencing comment rather than a single source. Not blocking and consistent with the OD-6 split (bucket attributes are a documented manual step).

**Concrete fix (optional):** No change required for approval. If desired, add one line to the SETUP.md bucket step saying "if you change this limit, update the matching `*_size` CHECK in `0003` (and vice-versa)" so the lockstep instruction lives at both edit sites, not only in the migration comment.

### 2. NIT — Officer inbox scale assumption is explicit but unbounded

**Where:** `OfficerAbsenceInbox` / `useAbsenceRequests` officer mode ("fetches **all** rows ordered by `created_at desc`").

**Problem:** The design now states the scale assumption plainly ("assumes a class-scale request volume … pagination is out of scope for the initial build, and if volume grows the status/date filters should move server-side") and specifies an ordering (`created_at desc`). This resolves the earlier ambiguity. It remains a deliberate unbounded fetch, which is fine at class scale and is now a documented choice rather than an oversight.

**Concrete fix (optional):** No change required for approval.

---

## Verified Assumptions (checked against source this pass)

1. **F1 reframe is present in all four required locations** — verified by reading OD-5, the Error-handling "File upload" bullet, the `AbsenceForm` component spec, and the `ReviewerUploadDialog` component spec in `design.md`. Each uses the identical "indeterminate upload indicator (spinner + 'Uploading…' state, disabled submit)" phrasing and the explicit `@supabase/storage-js` 2.45.4 no-progress-callback sentence. No stale "show progress" promise remains in the specs.
2. **F2 rule is present and binding** — verified: the Data layer section's mandatory "Profiles-embed rule" names `name`-only, forbids `profiles(*)` and `email`, cites the `profiles_read using(true)` email exposure, and the two concrete embeds (`useAbsenceRequests`, reviewer cards) select only `name`.
3. **F3 per-table anon outcomes are present** — verified: OD-4's "Per-role delivery outcome for every published table" block states events→anon receives, task_completions→anon nothing, reviewers→anon nothing, plus the absence tables being unpublished.
4. **Migration remains 0003-only** — verified: the publication/replica-identity, enums, tables, grants, RLS, and storage policies all land in `0003_classboard_ext.sql`; `0001`/`0002` untouched (locked decision, not reopened).

## Unverified / Wrong Assumptions

None material to this focused pass. The locked decisions (indeterminate indicator over XHR; RLS/storage/realtime model; `is_officer()` reuse; 0003-only migration) were deliberately not re-litigated. Live-database behaviors noted as unverified in the prior full review (`storage.foldername` 1-indexing, bucket MIME/size rejection on upload, end-to-end PostgREST embed authorization under RLS) remain implementation-time/integration-test items and are out of scope for this wording confirmation.
