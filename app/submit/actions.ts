"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

  const category = String(formData.get("category") ?? "").trim();
  if (!category) return { error: "Every joke needs a category." };

  const setup = String(formData.get("setup") ?? "").trim();
  const punchline = String(formData.get("punchline") ?? "").trim();

  if (!setup || !punchline) {
    return { error: "A joke needs both a setup and a punchline." };
  }
  if (setup.length > TEXT_LIMIT || punchline.length > TEXT_LIMIT) {
    return { error: `Keep each line to ${TEXT_LIMIT} characters or fewer.` };
  }

  // No rating is submitted with a post: stars are the average of what other
  // people vote, so it starts unrated and shows none.
  //
  // author_id is checked twice over: here, and by the insert policy
  // (auth.uid() = author_id), which is what stops a forged direct POST from
  // attributing a post to someone else.
  const { error } = await supabase
    .from("jokes")
    .insert({ category, setup, punchline, author_id: user.id });

  if (error) return { error: error.message };

  revalidatePath("/jokes");
  redirect("/jokes?submitted=1");
}
