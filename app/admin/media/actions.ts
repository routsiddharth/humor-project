"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertAdmin } from "@/lib/admin/dal";
import { one, pool, query } from "@/lib/admin/db";
import { runChain, saveTrace } from "@/lib/chain";
import { MAX_CATEGORY_CHARS, MAX_JOKE_CHARS, MAX_MODEL_CHARS, MAX_PROMPT_CHARS } from "@/lib/admin/limits";

// Every action opens with assertAdmin(). A Server Action is a POST endpoint
// anyone can call with a crafted body, so the check cannot live on the page
// that renders the form. Every write is also scoped to source = 'ai', so even a
// forged id can only ever reach an AI post.

export type Draft = { setup: string; punchline: string; model: string; prompt: string; category: string; generationId: number };
export type DraftState = { draft?: Draft; error?: string };
export type FormState = { error?: string; ok?: string };

type Fields = { setup: string; punchline: string; category: string; prompt: string | null; model: string };

function readFields(formData: FormData): Fields | string {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const f = { setup: get("setup"), punchline: get("punchline"), category: get("category"), prompt: get("prompt") || null, model: get("model") };

  if (!f.setup || !f.punchline) return "A joke needs both a setup and a punchline.";
  if (f.setup.length > MAX_JOKE_CHARS || f.punchline.length > MAX_JOKE_CHARS)
    return `Setup and punchline are ${MAX_JOKE_CHARS} characters at most.`;
  if (!f.category) return "Pick a category.";
  if (f.category.length > MAX_CATEGORY_CHARS) return `Categories are ${MAX_CATEGORY_CHARS} characters at most.`;
  // jokes_provenance_check: an AI post must name its model.
  if (!f.model) return "An AI post has to record which model wrote it.";
  if (f.model.length > MAX_MODEL_CHARS) return "That model name is too long.";
  if (f.prompt && f.prompt.length > MAX_PROMPT_CHARS) return `Prompts are ${MAX_PROMPT_CHARS} characters at most.`;
  return f;
}

// Runs a prompt chain from the mix and logs it to `generations` and
// `llm_responses`, exactly as the public /generate page does, so the ledger
// stays the full record of model calls. Nothing is posted until createAiJoke.
export async function draftWithGemini(_prev: DraftState, formData: FormData): Promise<DraftState> {
  const admin = await assertAdmin();

  const category = String(formData.get("category") ?? "").trim();
  const topic = String(formData.get("prompt") ?? "").trim() || null;
  if (!category) return { error: "Pick a category to draft in." };
  if (category.length > MAX_CATEGORY_CHARS) return { error: "That category name is too long." };
  if (topic && topic.length > MAX_PROMPT_CHARS) return { error: `Prompts are ${MAX_PROMPT_CHARS} characters at most.` };

  const avoid = await query<{ setup: string }>(
    `select setup from public.jokes where category = $1 and kind = 'text' order by created_at desc limit 40`,
    [category],
  );

  let run;
  try {
    run = await runChain({ category, topic, avoid: avoid.map((r) => r.setup) });
  } catch (error) {
    return { error: `The prompt chain could not write one: ${error instanceof Error ? error.message : "unknown error"}` };
  }
  const { joke } = run;

  const row = await one<{ id: number }>(
    `insert into public.generations (user_id, prompt, model, category, candidates, chain_id)
     values ($1, $2, $3, $4, $5::jsonb, $6) returning id::int`,
    [admin.id, topic, joke.model, category, JSON.stringify([{ setup: joke.setup, punchline: joke.punchline }]), run.chain.id],
  );
  await saveTrace(row!.id, run.chain.id, run.trace);

  return {
    draft: { setup: joke.setup, punchline: joke.punchline, model: joke.model, prompt: topic ?? "", category, generationId: row!.id },
  };
}

export async function createAiJoke(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await assertAdmin();
  const fields = readFields(formData);
  if (typeof fields === "string") return { error: fields };

  // Linking a ledger row is optional — a hand-entered joke has none. When one
  // is sent it must be this admin's own and not posted yet; the unique index
  // from 0008 would refuse a second post anyway, this gives the readable error.
  const raw = String(formData.get("generation_id") ?? "");
  let generationId: number | null = null;
  if (raw) {
    generationId = Number(raw);
    const gen = await one<{ posted: boolean }>(
      `select exists (select 1 from public.jokes j where j.generation_id = g.id) as posted
         from public.generations g where g.id = $1 and g.user_id = $2`,
      [generationId, admin.id],
    );
    if (!gen) return { error: "That draft is not in the ledger." };
    if (gen.posted) return { error: "That draft has already been posted." };
  }

  const row = await one<{ id: number }>(
    `insert into public.jokes (kind, source, setup, punchline, category, prompt, model, generation_id, author_id)
     values ('text', 'ai', $1, $2, $3, $4, $5, $6, $7) returning id::int`,
    [fields.setup, fields.punchline, fields.category, fields.prompt, fields.model, generationId, admin.id],
  );

  revalidatePath("/", "layout");
  redirect(`/admin/media/${row!.id}?created=1`);
}

export async function updateAiJoke(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const fields = readFields(formData);
  if (typeof fields === "string") return { error: fields };

  const updated = await one<{ id: number }>(
    `update public.jokes set setup = $2, punchline = $3, category = $4, prompt = $5, model = $6
      where id = $1 and source = 'ai' returning id::int`,
    [id, fields.setup, fields.punchline, fields.category, fields.prompt, fields.model],
  );
  if (!updated) return { error: "That AI post no longer exists." };

  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function deleteAiJoke(id: number): Promise<void> {
  await assertAdmin();

  // Ratings and Showdown matches cascade with the post (0003, 0009). The
  // matches leave its opponents' cached Elo one replay out of date, which is
  // the situation 0009 names showdown_rebuild_stats() for — so run it, in the
  // same transaction, whenever the post had played.
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ played: boolean }>(
      `select exists (select 1 from public.showdown_matches m
                       where $1 in (m.left_joke_id, m.right_joke_id)) as played
         from public.jokes where id = $1 and source = 'ai'`,
      [id],
    );
    if (rows.length) {
      await client.query(`delete from public.jokes where id = $1 and source = 'ai'`, [id]);
      if (rows[0].played) await client.query(`select public.showdown_rebuild_stats()`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  revalidatePath("/", "layout");
  redirect("/admin/media?deleted=1");
}
