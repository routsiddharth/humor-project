"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DAILY_LIMIT, MAX_TOPIC_CHARS } from "@/lib/generate";
import { generateJoke, type GeneratedJoke } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import type { GenerationCandidate } from "@/lib/types";

// How many existing setups to send as "do not repeat". Enough to cover a
// category without turning every request into a long prompt.
const AVOID_LIMIT = 40;

export type GenerateState = {
  error?: string;
  // Generations left in the window, returned because this action deliberately
  // does not revalidate /generate — a re-render would discard the draft the
  // user is looking at, so the page's own server-rendered count would go stale.
  remaining?: number;
  // The draft is display-only. Posting sends back nothing but the id below and
  // re-reads the text from the ledger, so nothing here is trusted on the way
  // back in.
  draft?: {
    generationId: number;
    setup: string;
    punchline: string;
    model: string;
    // Carried back rather than read off the form, so editing the category input
    // after generating cannot make the preview claim a category this joke was
    // not written for. Posting uses the ledger's copy either way.
    category: string;
  };
};

export async function generateDraft(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Server Actions accept direct POSTs, so this is the real gate — not the fact
  // that the page only renders for a signed-in visitor.
  if (!user) return { error: "Your session expired. Sign in again to generate." };

  const category = String(formData.get("category") ?? "").trim();
  if (!category) return { error: "Pick a category first." };
  if (category.length > 40) return { error: "That category name is too long." };

  const topicRaw = String(formData.get("topic") ?? "").trim();
  if (topicRaw.length > MAX_TOPIC_CHARS) {
    return { error: `Keep the topic to ${MAX_TOPIC_CHARS} characters or fewer.` };
  }
  // Empty means "just write me one", which is the normal press of the button.
  const topic = topicRaw || null;

  // ---- the quota ----
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);

  if (countError) return { error: countError.message };
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) {
    return {
      remaining: 0,
      error: `That is ${DAILY_LIMIT} generations in 24 hours — the daily limit. Post one of the ones you have, or come back tomorrow.`,
    };
  }

  // ---- what not to write ----
  //
  // Asked cold for a programming joke the model returns the single most famous
  // one, which for this table is already row 1 of the 0001 seed. Sending the
  // setups it would be competing with is the cheap half of the fix; the system
  // instruction in lib/gemini.ts is the other half.
  const { data: existing } = await supabase
    .from("jokes")
    .select("setup")
    .eq("category", category)
    .eq("kind", "text")
    .order("id", { ascending: false })
    .limit(AVOID_LIMIT)
    .returns<{ setup: string | null }[]>();

  const avoid = (existing ?? [])
    .map((row) => row.setup)
    .filter((setup): setup is string => Boolean(setup));

  // ---- the call ----
  let joke: GeneratedJoke;
  try {
    joke = await generateJoke({ category, topic, avoid });
  } catch (error) {
    // The chain in lib/gemini.ts has already retried capacity errors, so
    // whatever lands here is worth showing rather than retrying again.
    const status = (error as { status?: number } | null)?.status;
    if (status === 429) {
      return { error: "The model is out of quota for now. Try again in a few minutes." };
    }
    if (status === 503 || status === 500) {
      return { error: "The model is busy right now. Give it a moment and press again." };
    }
    return {
      error: error instanceof Error ? error.message : "Generating failed. Try again.",
    };
  }

  // ---- the ledger ----
  //
  // Written after the call succeeds, so a failed request does not spend quota —
  // and so `model` and `candidates` are known rather than guessed. This row is
  // also the only copy that postDraft will trust.
  const candidates: GenerationCandidate[] = [
    { setup: joke.setup, punchline: joke.punchline },
  ];

  const { data: ledger, error: ledgerError } = await supabase
    .from("generations")
    .insert({
      user_id: user.id,
      prompt: topic,
      model: joke.model,
      category,
      candidates,
    })
    .select("id")
    .single<{ id: number }>();

  if (ledgerError) return { error: ledgerError.message };

  return {
    // `used` was read before this call, so one more is now spent.
    remaining: Math.max(0, DAILY_LIMIT - used - 1),
    draft: {
      generationId: ledger.id,
      setup: joke.setup,
      punchline: joke.punchline,
      model: joke.model,
      category,
    },
  };
}

export type PostState = { error?: string };

// Takes an id and nothing else. The joke text is re-read from the ledger rather
// than accepted from the form, which is what stops a forged POST filing its
// author's own writing under an AI badge — and jokes_generation_id_key (0008)
// is what stops the same generation being posted twice.
export async function postDraft(
  _prev: PostState,
  formData: FormData,
): Promise<PostState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Sign in again to post." };

  const generationId = Number(formData.get("generationId"));
  if (!Number.isInteger(generationId)) return { error: "Unknown generation." };

  // The select policy is `auth.uid() = user_id`, so someone else's generation
  // id simply returns nothing here rather than needing its own ownership check.
  const { data: ledger, error: readError } = await supabase
    .from("generations")
    .select("id, prompt, model, category, candidates")
    .eq("id", generationId)
    .maybeSingle<{
      id: number;
      prompt: string | null;
      model: string;
      category: string;
      candidates: GenerationCandidate[];
    }>();

  if (readError) return { error: readError.message };
  if (!ledger) return { error: "That generation is gone. Generate another one." };

  const candidate = ledger.candidates?.[0];
  if (!candidate?.setup || !candidate?.punchline) {
    return { error: "That generation did not store a complete joke." };
  }

  const { error } = await supabase.from("jokes").insert({
    kind: "text",
    setup: candidate.setup,
    punchline: candidate.punchline,
    category: ledger.category,
    author_id: user.id,
    source: "ai",
    prompt: ledger.prompt,
    model: ledger.model,
    generation_id: ledger.id,
  });

  if (error) {
    // 23505 is the unique violation on jokes_generation_id_key: this generation
    // is already in the feed, which makes a replay a no-op rather than an error.
    if (error.code === "23505") {
      revalidatePath("/jokes");
      redirect("/jokes?submitted=1");
    }
    return { error: error.message };
  }

  revalidatePath("/jokes");
  redirect("/jokes?submitted=1");
}
