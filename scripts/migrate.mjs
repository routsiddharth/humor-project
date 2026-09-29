// Applies every file in supabase/migrations in filename order, once each.
//   npm run db:migrate
//
// Applied filenames are recorded in schema_migrations. That bookkeeping is not
// just tidiness: 0003 drops jokes.rating, which 0001's seed INSERT names in its
// column list. Re-running 0001 afterwards would fail at parse time — the
// `where not exists` guard does not save it, because the column is resolved
// before the guard is evaluated.
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
  await client.query(`
    create table if not exists public.schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows } = await client.query("select filename from public.schema_migrations");
  const applied = new Set(rows.map((row) => row.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} (already applied)`);
      continue;
    }

    const sql = await readFile(join(DIR, file), "utf8");

    // One transaction per file: a half-applied migration is worse than none.
    // The bookkeeping insert rides along inside it, so a rollback cannot leave
    // a file marked as applied.
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.schema_migrations (filename) values ($1)", [file]);
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
