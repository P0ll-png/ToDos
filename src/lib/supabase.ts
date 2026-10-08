/**
 * supabase.ts — single Supabase client plus config detection.
 *
 * The anon key is a public client credential by Supabase design; authorization
 * is enforced server-side by RLS, not key secrecy. When env is missing/invalid
 * the app renders <ConfigError /> instead of crashing with a null/network error.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True only when both env vars are present and the URL is a valid http(s) URL. */
export const isConfigured: boolean = Boolean(
  url && anonKey && /^https?:\/\//.test(url),
);

/** Opt-in Realtime->poll fallback flag (see SETUP.md). */
export const realtimeFallback: boolean =
  import.meta.env.VITE_REALTIME_FALLBACK === '1';

/** Named list of missing/invalid vars, for the ConfigError screen. */
export const missingConfig: string[] = (() => {
  const missing: string[] = [];
  if (!url || !/^https?:\/\//.test(url)) missing.push('VITE_SUPABASE_URL');
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY');
  return missing;
})();

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
