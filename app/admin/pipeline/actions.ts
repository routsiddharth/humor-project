"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertAdmin } from "@/lib/admin/dal";
import { deleteRow, explain, insertRow, parseFields, updateRow } from "@/lib/admin/pipeline/crud";
import { getResource } from "@/lib/admin/pipeline/resources";
import { ChainError, runChain, type TraceStep } from "@/lib/chain";
import { MAX_TOPIC_CHARS } from "@/lib/generate";
import { query } from "@/lib/admin/db";

// Every action opens with assertAdmin(): a Server Action is a public POST
// endpoint. The resource slug arrives from the client, so it is looked up in
// the config and refused if unknown, and the config's ops decide what is
// allowed — a forged call cannot create or delete where the UI does not.

export type RowState = { error?: string; ok?: string };

async function setup(slug: string) {
  const admin = await assertAdmin();
  const r = getResource(slug);
  if (!r) throw new Error("Unknown resource.");
  return { r, actorId: admin.id };
}

function read(r: NonNullable<ReturnType<typeof getResource>>, formData: FormData) {
  const values = parseFields(r.fields, formData);
  if (typeof values === "string") return values;
  return r.validate?.(values) ?? values;
}

export async function createRow(slug: string, _prev: RowState, formData: FormData): Promise<RowState> {
  const { r, actorId } = await setup(slug);
  if (!r.ops.create) throw new Error("Not allowed.");
  const values = read(r, formData);
  if (typeof values === "string") return { error: values };

  let id: number;
  try {
    id = (await insertRow(r, values, actorId))!.id;
  } catch (error) {
    return { error: explain(error, r, "write") };
  }
  revalidatePath("/admin/pipeline", "layout");
  redirect(`/admin/pipeline/${r.slug}/${id}?created=1`);
}

export async function updateRowAction(slug: string, id: number, _prev: RowState, formData: FormData): Promise<RowState> {
  const { r, actorId } = await setup(slug);
  const values = read(r, formData);
  if (typeof values === "string") return { error: values };

  try {
    if (!(await updateRow(r, id, values, actorId))) return { error: `That ${r.singular} no longer exists.` };
  } catch (error) {
    return { error: explain(error, r, "write") };
  }
  revalidatePath("/admin/pipeline", "layout");
  return { ok: "Saved." };
}

export async function deleteRowAction(slug: string, id: number): Promise<RowState> {
  const { r } = await setup(slug);
  if (!r.ops.delete) throw new Error("Not allowed.");
  try {
    await deleteRow(r, id);
  } catch (error) {
    return { error: explain(error, r, "delete") };
  }
  revalidatePath("/admin/pipeline", "layout");
  redirect(`/admin/pipeline/${r.slug}?deleted=1`);
}

// ---------- test run ----------
//
// Runs one chain exactly as Generate would and returns every step, without
// writing a generation, a trace or a post: it is for watching a chain work
// while editing it, not for the feed, and it spends no one's quota. It does
// spend real model calls, which is why it is admin-only.

export type TestRunState = {
  error?: string;
  failedStep?: string | null;
  trace?: TraceStep[];
  joke?: { setup: string; punchline: string; model: string };
  totalMs?: number;
};

export async function testRunChain(chainId: number, _prev: TestRunState, formData: FormData): Promise<TestRunState> {
  await assertAdmin();
  const category = String(formData.get("category") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim() || null;
  if (!category) return { error: "Pick a category to test in." };
  if (category.length > 40) return { error: "That category name is too long." };
  if (topic && topic.length > MAX_TOPIC_CHARS) return { error: `Keep the topic to ${MAX_TOPIC_CHARS} characters or fewer.` };
  const modelRaw = String(formData.get("model") ?? "auto");
  const modelId = modelRaw === "auto" ? null : Number(modelRaw);
  if (modelId !== null && !Number.isInteger(modelId)) return { error: "Unknown model." };

  const avoid = await query<{ setup: string }>(
    `select setup from public.jokes where category = $1 and kind = 'text' and setup is not null
      order by id desc limit 40`, [category]);

  const started = Date.now();
  try {
    const run = await runChain({ category, topic, avoid: avoid.map((a) => a.setup) }, { chainId, modelId });
    return { trace: run.trace, joke: run.joke, totalMs: Date.now() - started };
  } catch (error) {
    if (error instanceof ChainError) {
      return { error: error.message, failedStep: error.stepName, trace: error.trace, totalMs: Date.now() - started };
    }
    return { error: error instanceof Error ? error.message : "The test run failed." };
  }
}
