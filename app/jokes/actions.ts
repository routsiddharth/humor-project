"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RateResult = { error?: string };

// `rating` of null clears the viewer's vote, which is how clicking your current
// star again works. The trigger recomputes the average either way.
export async function rateJoke(
  jokeId: number,
  rating: number | null,
): Promise<RateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Server Actions accept direct POSTs, so this is the real gate — not the fact
  // that the UI only renders stars for signed-in visitors.
  if (!user) return { error: "Sign in to rate jokes." };

  if (!Number.isInteger(jokeId)) return { error: "Unknown joke." };
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { error: "Ratings run from 1 to 5." };
  }

  if (rating === null) {
    const { error } = await supabase
      .from("ratings")
      .delete()
      .eq("joke_id", jokeId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    // Upsert onto the composite primary key, so a second vote replaces the
    // first instead of erroring. user_id is set from the verified session here
    // and checked again by the insert/update policies.
    const { error } = await supabase.from("ratings").upsert(
      {
        joke_id: jokeId,
        user_id: user.id,
        rating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "joke_id,user_id" },
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/jokes");
  return {};
}
