// Applies every file in supabase/migrations in filename order.
//   npm run db:migrate
//
// Each migration is written to be idempotent, so re-running is a no-op.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const DIR = "supabase/migrations";

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set. Check .env.");
  process.exit(1);
}

const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

await client.connect();

try {
  for (const file of files) {
    const sql = await readFile(join(DIR, file), "utf8");
    // One transaction per file: a half-applied migration is worse than none.
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(`✓ ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`✗ ${file}\n  ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end().catch(() => {});
}
