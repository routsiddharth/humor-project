"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // The header renders from the session, so the whole layout is stale now.
  revalidatePath("/", "layout");
  redirect("/");
}
