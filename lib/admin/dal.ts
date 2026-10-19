import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { one } from "@/lib/admin/db";
import { createClient } from "@/lib/supabase/server";

export type Admin = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
};

// The data access layer's one gate. Every page and every Server Action calls
// this before touching lib/admin/db.ts. proxy.ts runs the same check first, but the
// Next.js docs are explicit that Proxy is an optimistic check, and layouts do
// not re-render on navigation — so the authoritative check lives here, next to
// the data.
//
// Two facts, both re-verified on every request:
//   1. the session is real — getUser() revalidates the JWT with Supabase;
//      getSession() would trust a forgeable cookie;
//   2. that user's profile has is_superadmin = true, read from the database
//      as owner, so no client-side policy or cache can answer for it.
//
// `cache` dedupes it within one render, so the layout and the page share a
// single round trip.
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const row = await one<Admin & { is_superadmin: boolean }>(
    `select p.id, u.email, p.first_name, p.last_name, p.avatar_path, p.is_superadmin
       from public.profiles p
       join auth.users u on u.id = p.id
      where p.id = $1`,
    [user.id],
  );
  if (!row?.is_superadmin) return null;

  const { is_superadmin: _, ...admin } = row;
  return admin;
});

// For pages. Signed out: off to Google and straight back. Signed in but not
// a superadmin: a plain 404, so the panel does not even admit to existing.
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (admin) return admin;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  notFound();
}

// For Server Actions, which are reachable by direct POST from anywhere. A
// thrown error rather than a redirect, so a forged call never gets as far as
// any query below its first line.
export async function assertAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) throw new Error("Not authorized.");
  return admin;
}
