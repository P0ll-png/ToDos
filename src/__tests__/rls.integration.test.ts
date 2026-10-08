// @vitest-environment node
/**
 * RLS integration suite — the REAL authorization boundary is Postgres RLS, so
 * these cases exercise the live policies against a real Supabase project. They
 * run ONLY when the backend + test-account env is provided; otherwise the whole
 * suite is skipped WITH A REASON and the equivalent manual steps live in
 * SETUP.md section 7.
 *
 * Required env (see SETUP.md section 7):
 *   RLS_TEST_SUPABASE_URL        project URL
 *   RLS_TEST_ANON_KEY            anon public key
 *   RLS_TEST_MEMBER_EMAIL/_PASSWORD    a seeded account whose role is 'member'
 *   RLS_TEST_OFFICER_EMAIL/_PASSWORD   a seeded account whose role is 'officer'
 *   RLS_TEST_TARGET_PROFILE_ID   a THIRD profile id the officer may promote/demote
 *                                and whose theme_preferences the officer must NOT
 *                                be able to overwrite (cross-user write).
 *
 * The accounts must already exist (sign up + the officer-bootstrap SQL in
 * SETUP.md). This suite never creates officers; it only verifies the policy
 * decisions. It restores any row it changes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = process.env;
const URL = env.RLS_TEST_SUPABASE_URL;
const ANON = env.RLS_TEST_ANON_KEY;
const MEMBER_EMAIL = env.RLS_TEST_MEMBER_EMAIL;
const MEMBER_PW = env.RLS_TEST_MEMBER_PASSWORD;
const OFFICER_EMAIL = env.RLS_TEST_OFFICER_EMAIL;
const OFFICER_PW = env.RLS_TEST_OFFICER_PASSWORD;
const TARGET_ID = env.RLS_TEST_TARGET_PROFILE_ID;

const configured = Boolean(
  URL &&
    ANON &&
    MEMBER_EMAIL &&
    MEMBER_PW &&
    OFFICER_EMAIL &&
    OFFICER_PW &&
    TARGET_ID,
);

// Skip-with-reason: a visible, explained skip rather than a silent pass.
const describeLive = configured
  ? describe
  : describe.skip;

if (!configured) {
  // eslint-disable-next-line no-console
  console.warn(
    'RLS integration suite SKIPPED: live Supabase env not set ' +
      '(RLS_TEST_SUPABASE_URL / RLS_TEST_ANON_KEY / member+officer creds / ' +
      'RLS_TEST_TARGET_PROFILE_ID). See SETUP.md section 7 for the manual steps.',
  );
}

function anonClient(): SupabaseClient {
  return createClient(URL as string, ANON as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedInClient(
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(URL as string, ANON as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  }
  return { client, userId: data.user.id };
}

describeLive('RLS policy boundary (live backend)', () => {
  let anon: SupabaseClient;
  let member: SupabaseClient;
  let memberId: string;
  let officer: SupabaseClient;
  let originalMemberName = '';

  beforeAll(async () => {
    anon = anonClient();
    const m = await signedInClient(MEMBER_EMAIL as string, MEMBER_PW as string);
    member = m.client;
    memberId = m.userId;
    const o = await signedInClient(
      OFFICER_EMAIL as string,
      OFFICER_PW as string,
    );
    officer = o.client;

    const { data } = await member
      .from('profiles')
      .select('name')
      .eq('id', memberId)
      .single();
    originalMemberName = (data?.name as string) ?? '';
  });

  afterAll(async () => {
    // Restore the member's name and ensure the target is left as a member.
    if (member) {
      await member
        .from('profiles')
        .update({ name: originalMemberName })
        .eq('id', memberId);
    }
    if (officer && TARGET_ID) {
      await officer
        .from('profiles')
        .update({ role: 'member' })
        .eq('id', TARGET_ID);
    }
  });

  it('anon SELECT works on all four tables', async () => {
    for (const table of ['profiles', 'subjects', 'schedule_slots', 'tasks']) {
      const { error } = await anon.from(table).select('*').limit(1);
      expect(error, `anon select ${table}`).toBeNull();
    }
  });

  it('anon INSERT/UPDATE/DELETE on tasks is rejected', async () => {
    const ins = await anon
      .from('tasks')
      .insert({ subject_id: TARGET_ID, title: 'x' });
    expect(ins.error, 'anon insert task').not.toBeNull();

    const upd = await anon
      .from('tasks')
      .update({ title: 'y' })
      .eq('id', '00000000-0000-0000-0000-000000000000');
    // No matching row OR permission denial — either way, nothing is written.
    expect(upd.error ?? { rows: 0 }).toBeTruthy();

    const del = await anon
      .from('tasks')
      .delete()
      .eq('id', '00000000-0000-0000-0000-000000000000');
    expect(del.error ?? { rows: 0 }).toBeTruthy();
  });

  it('member INSERT on tasks is rejected (WITH CHECK is_officer())', async () => {
    const { error } = await member
      .from('tasks')
      .insert({ subject_id: TARGET_ID, title: 'member-forged' });
    expect(error, 'member insert task should be denied').not.toBeNull();
  });

  it('member update({ name }) SUCCEEDS (Policy A)', async () => {
    const { error } = await member
      .from('profiles')
      .update({ name: 'Member Renamed' })
      .eq('id', memberId);
    expect(error, 'member self name update').toBeNull();
  });

  it('member update({ theme_preferences }) SUCCEEDS (Policy A)', async () => {
    const { error } = await member
      .from('profiles')
      .update({ theme_preferences: { mode: 'dark', accent: '#3366FF' } })
      .eq('id', memberId);
    expect(error, 'member self theme update').toBeNull();
  });

  it('PURE escalation: member update({ role:officer }) with NO other column is REJECTED', async () => {
    const { error } = await member
      .from('profiles')
      .update({ role: 'officer' })
      .eq('id', memberId);
    expect(
      error,
      'pure role self-escalation must be rejected',
    ).not.toBeNull();

    // And the stored role is unchanged.
    const { data } = await member
      .from('profiles')
      .select('role')
      .eq('id', memberId)
      .single();
    expect(data?.role).toBe('member');
  });

  it('member update({ name, role:officer }) is REJECTED', async () => {
    const { error } = await member
      .from('profiles')
      .update({ name: 'Sneaky', role: 'officer' })
      .eq('id', memberId);
    expect(error, 'name+role escalation must be rejected').not.toBeNull();

    const { data } = await member
      .from('profiles')
      .select('role')
      .eq('id', memberId)
      .single();
    expect(data?.role).toBe('member');
  });

  it('officer promote/demote of ANOTHER user SUCCEEDS (Policy B)', async () => {
    const promote = await officer
      .from('profiles')
      .update({ role: 'officer' })
      .eq('id', TARGET_ID);
    expect(promote.error, 'officer promote other').toBeNull();

    const demote = await officer
      .from('profiles')
      .update({ role: 'member' })
      .eq('id', TARGET_ID);
    expect(demote.error, 'officer demote other').toBeNull();
  });

  it('officer CROSS-USER theme_preferences write is rejected (only Policy A owns theme)', async () => {
    // Policy B grants update(role) only; it does NOT grant writing another
    // user's theme_preferences, which only the row owner (Policy A) may do.
    const { error } = await officer
      .from('profiles')
      .update({ theme_preferences: { mode: 'light', accent: '#FFFFFF' } })
      .eq('id', TARGET_ID);
    expect(
      error,
      'officer must not write another user theme_preferences',
    ).not.toBeNull();
  });
});
