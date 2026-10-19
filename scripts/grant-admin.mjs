// Grants (or with --revoke, removes) superadmin by Google account email.
//   npm run grant-admin -- someone@columbia.edu
//   npm run grant-admin -- someone@columbia.edu --revoke
//
// The account must have signed in once (to this panel or the public site), so
// that Supabase Auth has created its user and profile rows.
import { Client } from "pg";

const email = process.argv[2]?.toLowerCase();
const revoke = process.argv.includes("--revoke");
if (!email || !email.includes("@")) {
  console.error("usage: npm run grant-admin -- <email> [--revoke]");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rowCount } = await client.query(
    `update public.profiles p set is_superadmin = $2
       from auth.users u where u.id = p.id and lower(u.email) = $1`,
    [email, !revoke],
  );
  if (!rowCount) {
    console.error(`✗ No profile for ${email}. Sign in with that Google account once, then re-run.`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${email} is ${revoke ? "no longer" : "now"} a superadmin.`);
  }
} finally {
  await client.end();
}
