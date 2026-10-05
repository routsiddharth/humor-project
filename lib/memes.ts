// The content-kind vocabulary, shared by the list filters, the submit form and
// the Server Action that validates what the form posts.
//
// Deliberately free of server-only imports: the submit form is a Client
// Component and reads KINDS to label its own radio buttons.
import { publicObjectUrl } from "@/lib/storage";
import type { JokeKind } from "@/lib/types";

export const MEME_BUCKET = "memes";

// Uploads are capped here and again on the bucket itself (0005). Keep the two
// in step — and keep both under serverActions.bodySizeLimit in next.config.ts,
// or the request is rejected before this code ever runs.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// The extension is taken from the MIME type rather than the uploaded filename,
// so a file called `meme.png.exe` cannot pick its own. This map is also the
// allow-list: a type that is not a key here is not an accepted upload.
export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Matching `accept` attribute for the file input, so the picker offers the same
// set the action will accept.
export const IMAGE_ACCEPT = Object.keys(IMAGE_EXTENSIONS).join(",");

export const KINDS: {
  value: JokeKind;
  // How the /jokes filter names it.
  label: string;
  // How the submit form names it, where "Jokes" would be ambiguous.
  formLabel: string;
}[] = [
  { value: "text", label: "Jokes", formLabel: "Written joke" },
  { value: "image", label: "Memes", formLabel: "Image meme" },
];

export function memeImageUrl(path: string | null | undefined): string | null {
  return publicObjectUrl(MEME_BUCKET, path);
}

// Search params are untrusted strings, and a repeated param arrives as an
// array. Anything unrecognised reads as "no filter" rather than an error: a
// hand-edited URL should show the whole list, not a failure.
export function parseKind(value: string | string[] | undefined): JokeKind | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return KINDS.some((kind) => kind.value === candidate)
    ? (candidate as JokeKind)
    : null;
}

// Same, except the category vocabulary is whatever is in the table rather than
// a fixed list — so the caller passes in what it found.
export function parseCategory(
  value: string | string[] | undefined,
  known: string[],
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && known.includes(candidate) ? candidate : null;
}

// Filter links carry both params, so choosing a category keeps the kind and
// vice versa. `submitted=1` is dropped on purpose: the "Posted." banner should
// not survive a click.
export function jokesHref(filters: {
  kind?: JokeKind | null;
  category?: string | null;
}): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.category) params.set("category", filters.category);
  const query = params.toString();
  return query ? `/jokes?${query}` : "/jokes";
}
