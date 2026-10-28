import "server-only";

import { Pool, type QueryResultRow } from "pg";

import type { Admin } from "@/lib/admin/dal";

// The shared humor-study database — the semester snapshot restored into its
// own Supabase project — is a second database, separate from the joke board's.
// Same arrangement as lib/admin/db.ts: a direct Postgres pool as the owner, so
// row level security does not apply and every caller must have passed
// requireAdmin()/assertAdmin() first.

function createPool() {
  const connectionString = process.env.STUDY_DATABASE_URL;
  if (!connectionString) {
    throw new Error("STUDY_DATABASE_URL is not set — see .env");
  }
  return new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });
}

// Survive hot reloads, as lib/db.ts does.
const globalForDb = globalThis as typeof globalThis & { studyPool?: Pool };

export const studyPool = globalForDb.studyPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.studyPool = studyPool;
}

export async function query<T extends QueryResultRow>(text: string, params?: unknown[]) {
  const { rows } = await studyPool.query<T>(text, params);
  return rows;
}

export async function one<T extends QueryResultRow>(text: string, params?: unknown[]) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Every study table stamps created_by_user_id / modified_by_user_id from
// auth.uid(), which is null over a direct connection — and the columns are NOT
// NULL with a foreign key to public.profiles. So writes name the actor
// explicitly: the study profile with the same email as the signed-in admin.
export async function studyActorId(admin: Admin): Promise<string | null> {
  const row = await one<{ id: string }>(
    `select p.id from public.profiles p
       left join auth.users u on u.id = p.id
      where lower(p.email) = lower($1) or lower(u.email) = lower($1)
      order by p.created_datetime_utc limit 1`,
    [admin.email],
  );
  return row?.id ?? null;
}
