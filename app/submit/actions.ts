"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { readImageSize } from "@/lib/image-size";
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MEME_BUCKET,
  parseKind,
} from "@/lib/memes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type JokeFormState = { error?: string };

const TEXT_LIMIT = 280;

export async function submitJoke(
  _prev: JokeFormState,
  formData: FormData,
): Promise<JokeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Sign in again to post." };

  // parseKind() falls back to null on anything it does not recognise, which
  // here is a rejection rather than a default: a post whose kind we guessed
  // would fail the payload constraint anyway.
  const kind = parseKind(String(formData.get("kind") ?? ""));
  if (!kind) return { error: "Pick a written joke or a meme." };

  const category = String(formData.get("category") ?? "").trim();
  if (!category) return { error: "Every post needs a category." };

  // A written joke is setup + punchline; a meme is the image on its own. The
  // jokes_payload_check constraint refuses any row that mixes the two, so these
  // two branches are the only shapes that can be written.
  const post =
    kind === "text" ? readWrittenJoke(formData) : await readMeme(formData, user.id);
  if ("error" in post) return post;

  // No rating is submitted with a post: stars are the average of what other
  // people vote, so it starts unrated and shows none.
  //
  // author_id is checked twice over: here, and by the insert policy
  // (auth.uid() = author_id), which is what stops a forged direct POST from
  // attributing a post to someone else.
  const { error } = await supabase
    .from("jokes")
    .insert({ kind, category, author_id: user.id, ...post.row });

  if (error) {
    // The upload already happened. Without this the bucket would collect an
    // image that no row points at every time an insert is refused.
    if (post.uploadedPath) {
      await createAdminClient().storage.from(MEME_BUCKET).remove([post.uploadedPath]);
    }
    return { error: error.message };
  }

  revalidatePath("/jokes");
  redirect("/jokes?submitted=1");
}

type JokeRow = {
  setup: string | null;
  punchline: string | null;
  image_path: string | null;
  image_alt: string | null;
  image_width: number | null;
  image_height: number | null;
};

type Draft = { row: JokeRow; uploadedPath?: string };

function readWrittenJoke(formData: FormData): Draft | { error: string } {
  const setup = String(formData.get("setup") ?? "").trim();
  const punchline = String(formData.get("punchline") ?? "").trim();

  if (!setup || !punchline) {
    return { error: "A written joke needs both a setup and a punchline." };
  }
  if (setup.length > TEXT_LIMIT || punchline.length > TEXT_LIMIT) {
    return { error: `Keep each line to ${TEXT_LIMIT} characters or fewer.` };
  }

  return {
    row: {
      setup,
      punchline,
      image_path: null,
      image_alt: null,
      image_width: null,
      image_height: null,
    },
  };
}

async function readMeme(
  formData: FormData,
  userId: string,
): Promise<Draft | { error: string }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Pick an image for the meme." };
  }

  // The map is the allow-list: an unlisted MIME type has no extension here and
  // is refused. Taking the extension from the type rather than from file.name
  // also means an upload cannot choose its own.
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) return { error: "Images must be PNG, JPEG, WebP or GIF." };
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Images must be 5 MB or smaller." };
  }

  const description = String(formData.get("image_alt") ?? "").trim();
  if (description.length > TEXT_LIMIT) {
    return { error: `Keep the description to ${TEXT_LIMIT} characters or fewer.` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Read before uploading: a file whose header does not parse is far more
  // likely to be mislabelled than to be an exotic encoding, and the size is
  // what lets the card hold its shape. A null here is not fatal, though — the
  // card falls back to sizing itself once the image loads.
  const size = readImageSize(bytes);

  // The secret key bypasses RLS, so the bucket needs no insert policy. The
  // session check in the caller is what authorizes this write.
  const admin = createAdminClient();
  const path = `${userId}/${Date.now()}.${extension}`;

  const { error } = await admin.storage
    .from(MEME_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return { error: `Upload failed: ${error.message}` };

  return {
    uploadedPath: path,
    row: {
      setup: null,
      punchline: null,
      // Only the object path is stored in Postgres — never the image bytes.
      image_path: path,
      image_alt: description || null,
      image_width: size?.width ?? null,
      image_height: size?.height ?? null,
    },
  };
}
