// The /jokes filter vocabulary. The categories are whatever is in the table
// rather than a fixed list, so the caller passes in what it found.

// Search params are untrusted strings, and a repeated param arrives as an
// array. Anything unrecognised reads as "no filter" rather than an error: a
// hand-edited URL should show the whole list, not a failure.
export function parseCategory(
  value: string | string[] | undefined,
  known: string[],
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && known.includes(candidate) ? candidate : null;
}

// `submitted=1` is dropped on purpose: the "Posted." banner should not survive
// a click.
export function jokesHref(category: string | null): string {
  return category ? `/jokes?${new URLSearchParams({ category })}` : "/jokes";
}
