/**
 * storage.ts — pure file-validation and storage-path helpers.
 *
 * The actual Supabase createSignedUrl / upload calls live in the data layer;
 * only the pure, deterministic pieces live here so they are unit-testable with
 * no mocks. These same limits are mirrored by the storage RLS policies in the
 * migration, so client-side validation is a UX fast-path, not the sole gate.
 */

/** Signed URLs for private attachments are short-lived (seconds). */
export const SIGNED_URL_TTL_SECONDS = 60;

/** Allowed MIME types for excuse attachments. */
export const EXCUSE_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
/** Max size for an excuse attachment: 5 MB. */
export const EXCUSE_MAX = 5 * 1024 * 1024;

/** Allowed MIME types for a reviewer upload (PDF, DOCX, PPTX, JPG, PNG). */
export const REVIEWER_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
];
/** Max size for a reviewer upload: 20 MB. */
export const REVIEWER_MAX = 20 * 1024 * 1024;

export type ValidateFileResult =
  | { ok: true }
  | { ok: false; reason: 'type' | 'size' };

/**
 * Validate a file against an allowed MIME list and a byte ceiling. Type is
 * checked before size. A file exactly at the limit passes; one byte over
 * fails.
 */
export function validateFile(
  file: { type: string; size: number; name: string },
  allowed: string[],
  maxBytes: number,
): ValidateFileResult {
  if (!allowed.includes(file.type)) return { ok: false, reason: 'type' };
  if (file.size > maxBytes) return { ok: false, reason: 'size' };
  return { ok: true };
}

/**
 * Sanitize a user-supplied file name: strip any path separators and parent
 * references so a name can never escape its folder, collapse whitespace runs
 * to single spaces, and trim. The extension is preserved as part of the name.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/\.\./g, '') // drop parent-directory references
    .replace(/[/\\]/g, '') // drop path separators
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/**
 * Build the deterministic object path a storage policy keys on:
 * `${userId}/${segment}/${safeName}`. For excuse attachments the segment is
 * the request id; for reviewers it is the reviewer row id (generated before
 * upload), so the object is always reconstructable from the row.
 */
export function buildStoragePath(
  userId: string,
  segment: string,
  fileName: string,
): string {
  return `${userId}/${segment}/${sanitizeFileName(fileName)}`;
}
