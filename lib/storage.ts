// Builds the CDN URL for an object in a public Supabase Storage bucket.
//
// Pure string work — no client instance and no network call — so this is safe
// to import from both Server and Client Components. Returns null when there is
// no path, which the callers render as a fallback.
export function publicObjectUrl(
  bucket: string,
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
