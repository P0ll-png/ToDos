// seed-rls-fixtures.mjs — create the accounts + absence fixtures the live RLS
// integration suite needs, then print the RLS_TEST_* values to use.
//
// WHY A SCRIPT (and not plain SQL): auth users live in GoTrue's auth.users with
// hashed passwords + identities; hand-inserting them is unsupported and usually
// yields accounts that cannot sign in. The Admin API (service-role key) is the
// supported way to create a user with a known password and a confirmed email.
//
// SECURITY: this needs the SERVICE-ROLE key, which is a SECRET. It is read from
// the env var SUPABASE_SERVICE_ROLE_KEY at runtime and never written anywhere.
// Do NOT paste it into any committed file. Run like:
//
//   $env:SUPABASE_URL = "https://tfhhwqmnhrcjefeafzot.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key from dashboard>"
//   node scripts/seed-rls-fixtures.mjs
//
// Idempotent: re-running reuses existing users (by email) and reuses the most
// recent pending absence request it finds for member1 (ensuring it carries an
// evidence_url) instead of piling up duplicates. The passwords below are
// TEST-ONLY throwaways for a throwaway/dev project — do not reuse real
// credentials.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error(
    '\nMissing env. Set both before running:\n' +
      '  $env:SUPABASE_URL = "https://<ref>.supabase.co"\n' +
      '  $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"\n' +
      '\nFind the service_role key under Project Settings -> API ' +
      '(Project API keys -> service_role). It is a secret — never commit it.\n',
  );
  process.exit(1);
}

// Test-only accounts. Change the emails/passwords if you like; they just have
// to be consistent between this script and your .env.test.local / env vars.
const ACCOUNTS = {
  member1: { email: 'rls-member1@classboard.test', password: 'Test-Member1-pw!' },
  member2: { email: 'rls-member2@classboard.test', password: 'Test-Member2-pw!' },
  officer: { email: 'rls-officer@classboard.test', password: 'Test-Officer-pw!' },
};

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Create a confirmed user, or return the existing one with the same email. */
async function ensureUser({ email, password }) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the email verification step for a test account
  });
  if (!created.error && created.data.user) {
    return created.data.user;
  }
  // Already exists (or similar) — find it by paging the user list.
  const existing = await findUserByEmail(email);
  if (!existing) {
    throw new Error(
      `could not create or find user ${email}: ${created.error?.message}`,
    );
  }
  // Reset the password so it matches what the test will use.
  await admin.auth.admin.updateUserById(existing.id, { password });
  return existing;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

async function main() {
  console.log('Seeding RLS fixtures against', URL, '\n');

  // 1) accounts
  const m1 = await ensureUser(ACCOUNTS.member1);
  const m2 = await ensureUser(ACCOUNTS.member2);
  const off = await ensureUser(ACCOUNTS.officer);
  console.log('users ready:');
  console.log('  member1:', m1.email, m1.id);
  console.log('  member2:', m2.email, m2.id);
  console.log('  officer:', off.email, off.id);

  // The handle_new_user() trigger creates a public.profiles row per auth user.
  // Give it a beat in case creation just happened, then promote the officer.
  await new Promise((r) => setTimeout(r, 800));

  // 2) promote officer (service-role bypasses RLS)
  const promote = await admin
    .from('profiles')
    .update({ role: 'officer' })
    .eq('id', off.id)
    .select('id, role');
  if (promote.error) throw new Error(`promote officer failed: ${promote.error.message}`);
  console.log('\nofficer role set:', promote.data);

  // Make sure the two members are actually 'member' (not left over as officer).
  await admin.from('profiles').update({ role: 'member' }).in('id', [m1.id, m2.id]);

  // 3) a pending absence request owned by member1 (reuse the latest if present)
  let requestId;
  const existingReq = await admin
    .from('absence_requests')
    .select('id')
    .eq('user_id', m1.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  if (existingReq.error) throw new Error(`lookup request failed: ${existingReq.error.message}`);

  // A representative evidence link the read-isolation cases can observe (0004).
  const FIXTURE_EVIDENCE_URL = 'https://drive.google.com/file/d/EXAMPLE/view';

  if (existingReq.data.length > 0) {
    requestId = existingReq.data[0].id;
    console.log('\nreusing existing pending absence_request:', requestId);
    // Ensure the reused request carries an evidence_url so the seeded fixture is
    // always consistent for the read-isolation cases.
    const setLink = await admin
      .from('absence_requests')
      .update({ evidence_url: FIXTURE_EVIDENCE_URL })
      .eq('id', requestId)
      .is('evidence_url', null);
    if (setLink.error) throw new Error(`set evidence_url failed: ${setLink.error.message}`);
  } else {
    const insReq = await admin
      .from('absence_requests')
      .insert({
        user_id: m1.id,
        date_from: '2026-01-05',
        date_to: '2026-01-06',
        all_classes: true, // satisfies the absence_scope CHECK without needing real subject ids
        reason_category: 'illness',
        explanation: 'RLS fixture — seeded pending request for integration tests.',
        evidence_url: FIXTURE_EVIDENCE_URL,
        // status defaults to 'pending'; officer/review fields stay null
      })
      .select('id')
      .single();
    if (insReq.error) throw new Error(`insert request failed: ${insReq.error.message}`);
    requestId = insReq.data.id;
    console.log('\ncreated pending absence_request:', requestId);
  }

  // 4) print the RLS_TEST_* values to use
  console.log('\n============================================================');
  console.log('Done. Put these into .env.test.local (or set as env vars):');
  console.log('============================================================\n');
  const lines = [
    `RLS_TEST_SUPABASE_URL=${URL}`,
    `RLS_TEST_ANON_KEY=<your anon public key — the VITE_SUPABASE_ANON_KEY from .env>`,
    `RLS_TEST_MEMBER_EMAIL=${ACCOUNTS.member1.email}`,
    `RLS_TEST_MEMBER_PASSWORD=${ACCOUNTS.member1.password}`,
    `RLS_TEST_OFFICER_EMAIL=${ACCOUNTS.officer.email}`,
    `RLS_TEST_OFFICER_PASSWORD=${ACCOUNTS.officer.password}`,
    `RLS_TEST_TARGET_PROFILE_ID=${m2.id}`,
    `RLS_TEST_MEMBER2_EMAIL=${ACCOUNTS.member2.email}`,
    `RLS_TEST_MEMBER2_PASSWORD=${ACCOUNTS.member2.password}`,
    `RLS_TEST_ABSENCE_REQUEST_ID=${requestId}`,
  ];
  console.log(lines.join('\n'));
  console.log(
    '\n(The anon key is the ONLY value above you still fill in by hand — copy it\n' +
      'from .env. Everything else is real and ready.)\n',
  );
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
