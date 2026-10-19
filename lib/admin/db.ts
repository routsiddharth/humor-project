import "server-only";

import type { QueryResultRow } from "pg";

import { pool } from "@/lib/db";

// The admin panel's queries run over the site's direct Postgres pool, as the
// database owner. That bypasses row level security the same way the secret
// key does, which is what an admin panel needs: it reads auth.users for
// emails, every rating, and every Showdown match — none of which the
// publishable key can see. It is also exactly why every caller must have
// passed requireAdmin()/assertAdmin() first (lib/admin/dal.ts).
//
// `server-only` turns an accidental Client Component import into a build error.

export async function query<T extends QueryResultRow>(text: string, params?: unknown[]) {
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

export async function one<T extends QueryResultRow>(text: string, params?: unknown[]) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export { pool };
