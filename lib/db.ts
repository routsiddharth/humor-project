import { Pool, type QueryResultRow } from "pg";

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see .env");
  }
  return new Pool({
    connectionString,
    // Supabase terminates TLS with its own CA, which the default verification
    // chain rejects. The connection is still encrypted.
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
}

// `next dev` re-evaluates modules on every hot reload, which would leak a new
// pool each time. Stash it on globalThis so reloads reuse the same one.
const globalForDb = globalThis as typeof globalThis & { pool?: Pool };

export const pool = globalForDb.pool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export function query<T extends QueryResultRow>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params);
}
