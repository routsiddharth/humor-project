import { publicObjectUrl } from "@/lib/storage";

// The CDN URL for a profile photo, or null for a profile that has not uploaded
// one — which the callers render as initials.
export function avatarUrl(path: string | null | undefined): string | null {
  return publicObjectUrl("avatars", path);
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
