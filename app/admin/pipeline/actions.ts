"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertAdmin } from "@/lib/admin/dal";
import { deleteRow, explain, insertRow, parseFields, updateRow } from "@/lib/admin/pipeline/crud";
import { getResource } from "@/lib/admin/pipeline/resources";
import { ChainError, runChain, type TraceStep } from "@/lib/chain";
import { checkTemplate } from "@/lib/chain-template";
import { MAX_TOPIC_CHARS } from "@/lib/generate";
import { pool, query } from "@/lib/admin/db";

// Every action opens with assertAdmin(): a Server Action is a public POST
// endpoint. The resource slug arrives from the client, so it is looked up in
// the config and refused if unknown, and the config's ops decide what is
// allowed — a forged call cannot create or delete where the UI does not.

export type RowState = { error?: string; ok?: string; id?: number };

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

// ---------- inline editing ----------
//
// The same writes for forms that live on a list or chain page rather than a
// page of their own: they return instead of redirecting, and the revalidate
// re-renders the page they sit on with the new row in (or out of) it.

export async function createRowInline(slug: string, _prev: RowState, formData: FormData): Promise<RowState> {
  const { r, actorId } = await setup(slug);
  if (!r.ops.create) throw new Error("Not allowed.");
  const values = read(r, formData);
  if (typeof values === "string") return { error: values };
  try {
    const row = await insertRow(r, values, actorId);
    revalidatePath("/admin/pipeline", "layout");
    return { ok: "Created.", id: row!.id };
  } catch (error) {
    return { error: explain(error, r, "write") };
  }
}

export async function deleteRowInline(slug: string, id: number): Promise<RowState> {
  const { r } = await setup(slug);
  if (!r.ops.delete) throw new Error("Not allowed.");
  try {
    await deleteRow(r, id);
  } catch (error) {
    return { error: explain(error, r, "delete") };
  }
  revalidatePath("/admin/pipeline", "layout");
  return { ok: "Deleted." };
}

const STEP_REF = /\{\{\s*step([1-9][0-9]?)\s*\}\}/g;

// Swaps a step with the one above or below it. {{stepN}} names a position, so
// every prompt in the chain is rewritten to follow the two steps that moved:
// "use the angles" keeps meaning the angles step wherever it now sits. A move
// that would leave a step reading one that now runs after it is refused.
export async function moveStep(stepId: number, dir: number): Promise<RowState> {
  const admin = await assertAdmin();
  if (dir !== -1 && dir !== 1) throw new Error("Bad direction.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: steps } = await client.query<{ id: number; name: string; position: number; system_prompt: string; user_prompt: string }>(
      `select id::int, name, position, system_prompt, user_prompt from public.prompt_chain_steps
        where chain_id = (select chain_id from public.prompt_chain_steps where id = $1)
        order by position for update`, [stepId]);
    const i = steps.findIndex((s) => s.id === stepId);
    const a = steps[i], b = steps[i + dir];
    if (!a || !b) { await client.query("rollback"); return {}; }

    const swap = (t: string) => t.replace(STEP_REF, (whole, n: string) =>
      Number(n) === a.position ? `{{step${b.position}}}` : Number(n) === b.position ? `{{step${a.position}}}` : whole);
    const next = steps.map((s) => ({
      ...s,
      position: s.id === a.id ? b.position : s.id === b.id ? a.position : s.position,
      system_prompt: swap(s.system_prompt),
      user_prompt: swap(s.user_prompt),
    }));
    for (const s of next) {
      const problem = checkTemplate(s.system_prompt, s.position) ?? checkTemplate(s.user_prompt, s.position);
      if (problem) {
        await client.query("rollback");
        return { error: `Can't move it there: in “${s.name}”, ${problem}` };
      }
    }
    const changed = next.filter((s, k) => s.position !== steps[k].position
      || s.system_prompt !== steps[k].system_prompt || s.user_prompt !== steps[k].user_prompt);
    // One statement, so the deferrable unique (0015) sees the finished swap.
    await client.query(
      `update public.prompt_chain_steps s
          set position = v.position, system_prompt = v.sp, user_prompt = v.up, updated_by = $5, updated_at = now()
         from unnest($1::bigint[], $2::smallint[], $3::text[], $4::text[]) as v(id, position, sp, up)
        where s.id = v.id`,
      [changed.map((s) => s.id), changed.map((s) => s.position), changed.map((s) => s.system_prompt),
        changed.map((s) => s.user_prompt), admin.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  revalidatePath("/admin/pipeline", "layout");
  return {};
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
