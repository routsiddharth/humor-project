// Verifies that DATABASE_URL actually reaches Supabase.
//   npm run db:check
import { Client } from "pg";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("✗ DATABASE_URL is not set. Check .env.");
  process.exit(1);
}

if (url.includes("YOUR_DB_PASSWORD")) {
  console.error(
    "✗ DATABASE_URL still has the placeholder password.\n" +
      "  Put the real one in .env (Supabase dashboard → Project Settings → Database).",
  );
  process.exit(1);
}

const { hostname, port, username } = new URL(url);
console.log(`→ ${username}@${hostname}:${port}`);

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

try {
  await client.connect();
  const { rows } = await client.query(
    "select current_database() as db, current_user as usr, version() as version",
  );
  const { db, usr, version } = rows[0];
  console.log("✓ connected");
  console.log(`  database: ${db}`);
  console.log(`  user:     ${usr}`);
  console.log(`  server:   ${version.split(" on ")[0]}`);
} catch (err) {
  console.error(`✗ ${err.message}`);
  if (err.code === "ENETUNREACH" || err.code === "EHOSTUNREACH") {
    console.error(
      "  The direct host is IPv6-only and this network has no IPv6 route.\n" +
        "  Use the pooler host (aws-0-us-east-2.pooler.supabase.com) instead.",
    );
  }
  if (/Tenant or user not found/i.test(err.message)) {
    console.error(
      "  The pooler needs the username `postgres.<project-ref>`, not `postgres`,\n" +
        "  and the region in the host must match the project's.",
    );
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
