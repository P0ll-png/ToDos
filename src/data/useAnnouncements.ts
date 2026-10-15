/**
 * useAnnouncements — live reads for the Announcements board. announcements IS
 * published to Realtime (0005), so a freshly posted announcement appears on
 * other clients without a refetch. This is a thin wrapper over
 * useRealtimeTable exactly like useReviewers, resolving each author's display
 * name through an EMBEDDED profiles relationship.
 *
 * PRIVACY — Profiles-embed rule (mandatory): the embed selects `name` ONLY —
 * never `profiles(*)` and never `email` — because `profiles_read` is
 * `using(true)` and would otherwise surface a user's email. announcements has a
 * SINGLE FK to profiles (created_by), so the embed is unambiguous; we alias it
 * `author` and select only `name`.
 *
 * Public read, no session gate (matches useReviewers for the public-read tables;
 * authEpoch is omitted). The select override is passed through so both the
 * initial fetch and the fallback poll carry the embed; the Realtime INSERT
 * payload does NOT include the embed, so a freshly streamed row arrives with an
 * undefined authorName until the next fetch (focus/poll) — acceptable (the item
 * falls back to "Unknown" until then).
 */
import type { Announcement, AnnouncementRow } from '../lib/types';
import { useRealtimeTable, type DataHookState } from './useRealtimeTable';

/** The embedded author shape (name ONLY — privacy). */
type AnnouncementEmbedRow = AnnouncementRow & {
  author?: { name: string } | null;
};

// The FK alias assumes PostgREST's default constraint name
// `announcements_created_by_fkey`, derived from the `created_by references
// public.profiles(id)` clause in 0005.
export const ANNOUNCEMENTS_SELECT =
  '*, author:profiles!announcements_created_by_fkey(name)';

function rowToAnnouncement(row: AnnouncementRow): Announcement {
  const embed = row as AnnouncementEmbedRow;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...(embed.author?.name != null ? { authorName: embed.author.name } : {}),
  };
}

export function useAnnouncements(pollMs = 15000): DataHookState<Announcement> {
  return useRealtimeTable<AnnouncementRow, Announcement>(
    'announcements',
    rowToAnnouncement,
    pollMs,
    ANNOUNCEMENTS_SELECT,
  );
}
