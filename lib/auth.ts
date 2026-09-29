import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// getUser() revalidates the JWT with Supabase on every call. getSession() only
// reads the cookie, which a client can forge — never use it for a gate.
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();
  return data;
}

// The trigger creates the row with both names NULL, so "has a row" and "has
// finished onboarding" are different questions. This answers the second.
export function isProfileComplete(
  profile: Pick<Profile, "first_name" | "last_name"> | null | undefined,
): boolean {
  return Boolean(profile?.first_name?.trim() && profile?.last_name?.trim());
}

// Rejects anything that is not a same-origin path. Without the `//` check,
// `?next=//evil.com` would be treated as a path by us and as a host by the
// browser — a textbook open redirect, and a nasty one mid-OAuth because the
// URL it hands over carries the auth code.
export function safeNext(value: string | string[] | null | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }
  return candidate;
}

export async function requireUser(currentPath: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  return user;
}

// For pages that need a named user: bounces to sign-in when signed out, and to
// onboarding when signed in but nameless.
export async function requireCompleteProfile(currentPath: string) {
  const user = await requireUser(currentPath);
  const profile = await getProfile(user.id);
  if (!isProfileComplete(profile)) {
    redirect(`/onboarding?next=${encodeURIComponent(currentPath)}`);
  }
  return { user, profile: profile as Profile };
}
