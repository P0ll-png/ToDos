// run-rls-tests.mjs — load .env.test.local into process.env, then run the live
// RLS integration suite. Zero dependencies (no dotenv): a tiny inline parser.
//
// Usage: npm run test:rls
//
// .env.test.local is gitignored (the `*.local` rule). If it is missing, this
// prints how to create it and exits non-zero. The suite itself still
// skips-with-reason if any required var is absent, so a partial file is safe.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.test.local');

if (!existsSync(envPath)) {
  console.error(
    '\n.env.test.local not found.\n' +
      'Copy .env.test.local.example to .env.test.local and fill in your real\n' +
      'Supabase URL, anon key, seeded account creds, and absence fixture ids.\n' +
      'See SETUP.md section 7.\n',
  );
  process.exit(1);
}

// Minimal dotenv-style parser: KEY=VALUE per line, ignores blanks and #comments.
// Does not do variable expansion or multi-line values — none are needed here.
const raw = readFileSync(envPath, 'utf8');
let loaded = 0;
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  // Strip a single pair of surrounding quotes if present.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  // Skip untouched placeholders like <...> so they don't look "set".
  if (value.startsWith('<') && value.endsWith('>')) continue;
  if (key) {
    process.env[key] = value;
    loaded++;
  }
}

console.log(`Loaded ${loaded} RLS_TEST_* value(s) from .env.test.local`);

// Hand off to vitest for just the RLS suite, inheriting the enriched env.
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'src/__tests__/rls.integration.test.ts', '--reporter=verbose'],
  { stdio: 'inherit', env: process.env, cwd: root },
);

process.exit(result.status ?? 1);
