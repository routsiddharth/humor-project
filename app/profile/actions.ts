"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/auth";
import { HOME } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = { error?: string; ok?: string };

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const NAME_LIMIT = 60;

async function applyProfileUpdate(
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Server Actions are reachable by direct POST, not only from the form we
  // rendered, so the session check belongs here rather than on the page.
  if (!user) return { error: "Your session expired. Sign in again to save." };

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();

  if (!firstName || !lastName) {
    return { error: "First and last name are both required." };
  }
  if (firstName.length > NAME_LIMIT || lastName.length > NAME_LIMIT) {
    return { error: `Names must be ${NAME_LIMIT} characters or fewer.` };
  }

  const updates: Record<string, string> = {
    first_name: firstName,
    last_name: lastName,
    updated_at: new Date().toISOString(),
  };

  const file = formData.get("avatar");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      return { error: "That file is not an image." };
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return { error: "Images must be 5 MB or smaller." };
    }

    // The secret key bypasses RLS, so the bucket needs no insert policy. The
    // session check above is what authorizes this write.
    const admin = createAdminClient();
    const extension =
      file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
      "jpg";

    // A fresh path per upload. Reusing one path would leave the previous image
    // cached on the Storage CDN and the new one invisible for hours.
    const path = `${user.id}/${Date.now()}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

    const { data: existing } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .maybeSingle<{ avatar_path: string | null }>();

    // Only the object path is stored in Postgres — never the image bytes.
    updates.avatar_path = path;

    if (existing?.avatar_path) {
      await admin.storage.from("avatars").remove([existing.avatar_path]);
    }
  }

  // Runs as the signed-in user, so the "users update their own profile" policy
  // is the real guard on which row can change.
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: "Profile saved." };
}

export async function saveProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  return applyProfileUpdate(formData);
}

export async function completeOnboarding(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = await applyProfileUpdate(formData);
  if (result.error) return result;

  // redirect() throws a control-flow exception, so it must sit outside the
  // failure branch above.
  redirect(safeNext(String(formData.get("next") ?? HOME)));
}
