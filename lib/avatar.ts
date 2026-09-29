// Builds the CDN URL for an object in the public `avatars` bucket.
//
// Pure string work, no client instance and no network call, so this is safe to
// import from both Server and Client Components. Returns null for a profile
// that has not uploaded a photo, which the callers render as initials.
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

// Initials fallback. Falls back to "?" so the circle is never empty.
export function initials(firstName?: string | null, lastName?: string | null): string {
  const letters = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.trim();
  return letters ? letters.toUpperCase() : "?";
}

export function displayName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}
