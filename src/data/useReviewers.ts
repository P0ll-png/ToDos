/**
 * useReviewers — live reads for the Reviewers page. reviewers IS published to
 * Realtime (design OD-4), so a new upload appears on other signed-in clients
 * without a refetch. This is a thin wrapper over useRealtimeTable exactly like
 * useTasks/useEvents, except it resolves each uploader's display name through
 * an EMBEDDED profiles relationship.
 *
 * PRIVACY — Profiles-embed rule (mandatory, design Data layer): the embed
 * selects `name` ONLY — never `profiles(*)` and never `email` — because
 * `profiles_read` is `using(true)` and would otherwise surface a user's email.
 * reviewers has a SINGLE FK to profiles (uploader_id), so the embed is not
 * ambiguous; we still alias it `uploader` and select only `name`.
 *
 * The select override is passed through to useRealtimeTable so both the initial
 * fetch and the fallback poll carry the embed; the Realtime reconcile payload
 * for an INSERT does NOT include the embed, so a freshly streamed row arrives
 * with an undefined uploaderName until the next fetch — acceptable (the card
 * falls back to "Unknown" and the name fills in on focus/poll). Anonymous
 * clients receive nothing (no grant/policy), matching the signed-in-only gate.
 */
import type { Reviewer, ReviewerRow } from '../lib/types';
import { useRealtimeTable, type DataHookState } from './useRealtimeTable';

/** The embedded uploader shape (name ONLY — privacy). */
type ReviewerEmbedRow = ReviewerRow & {
  uploader?: { name: string } | null;
};

export const REVIEWER_SELECT =
  '*, uploader:profiles!reviewers_uploader_id_fkey(name)';

function rowToReviewer(row: ReviewerRow): Reviewer {
  const embed = row as ReviewerEmbedRow;
  return {
    id: row.id,
    uploaderId: row.uploader_id,
    subjectId: row.subject_id,
    title: row.title,
    description: row.description,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    ...(embed.uploader?.name != null
      ? { uploaderName: embed.uploader.name }
      : {}),
  };
}

export function useReviewers(pollMs = 15000): DataHookState<Reviewer> {
  return useRealtimeTable<ReviewerRow, Reviewer>(
    'reviewers',
    rowToReviewer,
    pollMs,
    REVIEWER_SELECT,
  );
}
