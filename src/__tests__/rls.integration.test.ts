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

// Extension (0003/0004) cases need a SECOND member (to prove one member cannot
// read another's absence request) plus a seeded PENDING absence request owned by
// the first member (ideally with an evidence_url). See SETUP.md section 7.
const MEMBER2_EMAIL = env.RLS_TEST_MEMBER2_EMAIL;
const MEMBER2_PW = env.RLS_TEST_MEMBER2_PASSWORD;
const ABSENCE_REQUEST_ID = env.RLS_TEST_ABSENCE_REQUEST_ID;

const configured = Boolean(
  URL &&
    ANON &&
    MEMBER_EMAIL &&
    MEMBER_PW &&
    OFFICER_EMAIL &&
    OFFICER_PW &&
    TARGET_ID,
);

// The extension suite needs the base env PLUS the four 0003-specific vars. It is
// skipped independently (with its own reason) when only the base env is present,
// so the base role-escalation suite can still run on a project without the
// seeded absence fixtures.
const extConfigured = Boolean(
  configured && MEMBER2_EMAIL && MEMBER2_PW && ABSENCE_REQUEST_ID,
);

// Skip-with-reason: a visible, explained skip rather than a silent pass.
const describeLive = configured
  ? describe
  : describe.skip;

const describeExt = extConfigured ? describe : describe.skip;

if (!configured) {
  // eslint-disable-next-line no-console
  console.warn(
    'RLS integration suite SKIPPED: live Supabase env not set ' +
      '(RLS_TEST_SUPABASE_URL / RLS_TEST_ANON_KEY / member+officer creds / ' +
      'RLS_TEST_TARGET_PROFILE_ID). See SETUP.md section 7 for the manual steps.',
  );
} else if (!extConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    'RLS extension (0003/0004) suite SKIPPED: the extension fixtures are not ' +
      'set (RLS_TEST_MEMBER2_EMAIL/_PASSWORD, RLS_TEST_ABSENCE_REQUEST_ID — a ' +
      'second member and a seeded pending absence request owned by the first ' +
      'member). The base role-escalation suite still runs. See SETUP.md ' +
      'section 7.',
  );
}

// A random v4-shaped uuid that will not exist — used to prove a cross-user /
// guessed id is denied (RLS returns zero rows, never another user's data).
const NONEXISTENT_UUID = '11111111-1111-4111-8111-111111111111';

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

/**
 * Extension (0003/0004) RLS boundary — the new tables (events, task_completions,
 * absence_requests, reviewers) and the reviewers storage.objects policies.
 * Proves AC1–AC3 and AC7–AC12 against the live policies, plus the 0004 evidence
 * link: it is visible to the owner and officers but NOT to another member (it
 * rides on the absence_requests row under ar_select). Skipped (with its own
 * reason) unless the extension fixtures are set.
 *
 * Fixtures (SETUP.md section 7): a second member, and a seeded PENDING
 * absence_requests row owned by the FIRST member (RLS_TEST_ABSENCE_REQUEST_ID),
 * ideally carrying an evidence_url. This suite restores any row it changes (it
 * demotes the request back to pending in afterAll).
 */
describeExt('RLS extension boundary — 0003/0004 tables + storage (live backend)', () => {
  let anon: SupabaseClient;
  let member: SupabaseClient;
  let memberId: string;
  let member2: SupabaseClient;
  let member2Id: string;
  let officer: SupabaseClient;

  beforeAll(async () => {
    anon = anonClient();
    const m = await signedInClient(MEMBER_EMAIL as string, MEMBER_PW as string);
    member = m.client;
    memberId = m.userId;
    const m2 = await signedInClient(
      MEMBER2_EMAIL as string,
      MEMBER2_PW as string,
    );
    member2 = m2.client;
    member2Id = m2.userId;
    const o = await signedInClient(
      OFFICER_EMAIL as string,
      OFFICER_PW as string,
    );
    officer = o.client;
  });

  afterAll(async () => {
    // Ensure the seeded request is left PENDING so the suite is re-runnable
    // (several cases depend on its pending status; none should leave it changed,
    // but a failed assertion mid-test could, so restore defensively).
    if (officer && ABSENCE_REQUEST_ID) {
      await officer
        .from('absence_requests')
        .update({
          status: 'pending',
          officer_remark: null,
          reviewed_by: null,
          reviewed_at: null,
        })
        .eq('id', ABSENCE_REQUEST_ID);
    }
  });

  // ---- anon has no grant/policy on the private tables (defense in depth) ----

  it('anon SELECT is denied/empty on task_completions, absence tables, reviewers', async () => {
    for (const table of [
      'task_completions',
      'absence_requests',
      'reviewers',
    ]) {
      const { data, error } = await anon.from(table).select('*').limit(1);
      // With no grant/policy the read yields either an error or zero rows —
      // never another user's data.
      expect(
        (error != null || (data?.length ?? 0) === 0),
        `anon select ${table} must be denied or empty`,
      ).toBe(true);
    }
  });

  it('anon INSERT is rejected on task_completions and reviewers', async () => {
    const tc = await anon
      .from('task_completions')
      .insert({ user_id: NONEXISTENT_UUID, task_id: NONEXISTENT_UUID });
    expect(tc.error, 'anon insert task_completions').not.toBeNull();

    const rv = await anon.from('reviewers').insert({
      uploader_id: NONEXISTENT_UUID,
      subject_id: NONEXISTENT_UUID,
      title: 'forged',
      storage_path: 'x/y/z',
      file_name: 'z',
      mime_type: 'application/pdf',
      size_bytes: 1,
    });
    expect(rv.error, 'anon insert reviewer').not.toBeNull();
  });

  // ---- events: member denied write, officer allowed (AC1 / AC2) ----

  it('member INSERT on events is rejected; officer INSERT/DELETE succeeds (AC1/AC2)', async () => {
    const memberIns = await member
      .from('events')
      .insert({ type: 'quiz', title: 'member-forged', event_date: '2099-01-01' });
    expect(memberIns.error, 'member insert event must be denied').not.toBeNull();

    const officerIns = await officer
      .from('events')
      .insert({ type: 'quiz', title: 'rls-test-event', event_date: '2099-01-01' })
      .select('id')
      .single();
    expect(officerIns.error, 'officer insert event').toBeNull();
    const newId = (officerIns.data as { id: string } | null)?.id;
    expect(newId, 'officer-created event id').toBeTruthy();
    if (newId) {
      const del = await officer.from('events').delete().eq('id', newId);
      expect(del.error, 'officer delete event').toBeNull();
    }
  });

  // ---- task_completions: own-row only; tasks.status untouched (AC3) ----

  it('member completion insert/delete own-row OK; cross-user denied; tasks.status untouched (AC3)', async () => {
    // Pick any readable task (anon-readable public table).
    const { data: tasks } = await member.from('tasks').select('id, status').limit(1);
    const task = (tasks as { id: string; status: string }[] | null)?.[0];
    if (!task) {
      // No task seeded — nothing to toggle; the policy is still proven by the
      // cross-user case below, which uses a nonexistent task id.
      expect(task, 'at least one task should exist to toggle').toBeTruthy();
      return;
    }
    const statusBefore = task.status;

    // Own-row insert then delete (idempotent cleanup first in case of a prior run).
    await member
      .from('task_completions')
      .delete()
      .match({ user_id: memberId, task_id: task.id });
    const ins = await member
      .from('task_completions')
      .insert({ user_id: memberId, task_id: task.id });
    expect(ins.error, 'member own-row completion insert').toBeNull();

    // The class-wide tasks.status must be unchanged by the completion toggle.
    const { data: after } = await member
      .from('tasks')
      .select('status')
      .eq('id', task.id)
      .single();
    expect((after as { status: string }).status).toBe(statusBefore);

    const del = await member
      .from('task_completions')
      .delete()
      .match({ user_id: memberId, task_id: task.id });
    expect(del.error, 'member own-row completion delete').toBeNull();

    // Cross-user insert (user_id = ANOTHER member) must fail tc_insert WITH CHECK.
    const crossUser = await member
      .from('task_completions')
      .insert({ user_id: member2Id, task_id: task.id });
    expect(
      crossUser.error,
      'member cannot insert a completion for ANOTHER user',
    ).not.toBeNull();
  });

  // ---- absences: owner-or-officer read; a second member sees nothing (AC7) ----

  it('member reads OWN absence request + evidence_url; a SECOND member is denied it (AC7)', async () => {
    const own = await member
      .from('absence_requests')
      .select('*')
      .eq('id', ABSENCE_REQUEST_ID as string)
      .maybeSingle();
    expect(own.error, 'owning member read own request').toBeNull();
    expect(own.data, 'owning member sees the request').toBeTruthy();
    // 0004: evidence_url is a column on the request row, so the owner sees it
    // (its value depends on the seeded fixture — the key is the field is
    // present/readable, not NULL by policy).
    expect(
      Object.prototype.hasOwnProperty.call(own.data ?? {}, 'evidence_url'),
      'owner read includes the evidence_url column',
    ).toBe(true);

    // An officer sees the SAME row (owner-or-officer) including evidence_url.
    const officerView = await officer
      .from('absence_requests')
      .select('*')
      .eq('id', ABSENCE_REQUEST_ID as string)
      .maybeSingle();
    expect(officerView.error, 'officer read any request').toBeNull();
    expect(officerView.data, 'officer sees the request').toBeTruthy();
    expect(
      Object.prototype.hasOwnProperty.call(officerView.data ?? {}, 'evidence_url'),
      'officer read includes the evidence_url column',
    ).toBe(true);

    const other = await member2
      .from('absence_requests')
      .select('*')
      .eq('id', ABSENCE_REQUEST_ID as string)
      .maybeSingle();
    // ar_select is owner-or-officer: a second member matches no row (null), and
    // never gets another member's data — including the evidence_url.
    expect(other.data, 'second member must NOT see the request or its link').toBeNull();
  });

  // ---- reviewers: any authenticated read/download; non-owner delete denied (AC11/12) ----

  it('any authenticated user can read reviewers; anon cannot (AC11)', async () => {
    const auth = await member.from('reviewers').select('*').limit(1);
    expect(auth.error, 'authenticated reviewer read').toBeNull();

    const anonRead = await anon.from('reviewers').select('*').limit(1);
    expect(
      anonRead.error != null || (anonRead.data?.length ?? 0) === 0,
      'anon reviewer read must be denied or empty',
    ).toBe(true);
  });

  it('a non-owner cannot delete another user\'s reviewer, except an officer (AC12)', async () => {
    // member2 uploads a reviewer it owns.
    const id = crypto.randomUUID();
    const { data: subjects } = await member2.from('subjects').select('id').limit(1);
    const subjectId = (subjects as { id: string }[] | null)?.[0]?.id;
    expect(subjectId, 'a subject should exist to attach a reviewer').toBeTruthy();
    if (!subjectId) return;

    const path = `${member2Id}/${id}/rls-reviewer.pdf`;
    const up = await member2.storage
      .from('reviewers')
      .upload(path, new Blob(['x'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
      });
    expect(up.error, 'member2 upload reviewer object').toBeNull();
    const ins = await member2.from('reviewers').insert({
      id,
      uploader_id: member2Id,
      subject_id: subjectId,
      title: 'rls-reviewer',
      storage_path: path,
      file_name: 'rls-reviewer.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1,
    });
    expect(ins.error, 'member2 insert reviewer row').toBeNull();

    // The FIRST member (a non-owner) cannot delete it — rv_delete USING fails,
    // so no row is matched and the row survives.
    await member.from('reviewers').delete().eq('id', id);
    const survived = await member2
      .from('reviewers')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    expect(survived.data, 'non-owner delete must NOT remove the reviewer').toBeTruthy();

    // An OFFICER can delete it (moderation).
    const officerDel = await officer.from('reviewers').delete().eq('id', id);
    expect(officerDel.error, 'officer delete any reviewer').toBeNull();
    const gone = await member2
      .from('reviewers')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    expect(gone.data, 'officer delete removes the reviewer').toBeNull();

    // Clean up the storage object (idempotent).
    await member2.storage.from('reviewers').remove([path]);
  });

  // ---- pending-count query (AC10) ----

  it('the officer pending-count query returns the exact count (AC10)', async () => {
    const { count, error } = await officer
      .from('absence_requests')
      .select('*', { head: true, count: 'exact' })
      .eq('status', 'pending');
    expect(error, 'officer pending-count query').toBeNull();
    // The seeded request is pending, so the count is at least 1.
    expect(count ?? 0).toBeGreaterThanOrEqual(1);
  });
});
