"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type JokeFormState = { error?: string };

export async function submitJoke(
  _prev: JokeFormState,
  formData: FormData,
): Promise<JokeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Sign in again to post." };

  const setup = String(formData.get("setup") ?? "").trim();
  const punchline = String(formData.get("punchline") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!setup || !punchline || !category) {
    return { error: "Setup, punchline and category are all required." };
  }
  if (setup.length > 280 || punchline.length > 280) {
    return { error: "Setup and punchline must be 280 characters or fewer." };
  }

  // No rating is submitted with the joke: stars are the average of what other
  // people vote, so it starts unrated and shows none.
  //
  // author_id is checked twice over: here, and by the insert policy
  // (auth.uid() = author_id), which is what stops a forged direct POST from
  // attributing a joke to someone else.
  const { error } = await supabase
    .from("jokes")
    .insert({ setup, punchline, category, author_id: user.id });

  if (error) return { error: error.message };

  revalidatePath("/jokes");
  redirect("/jokes?submitted=1");
}
