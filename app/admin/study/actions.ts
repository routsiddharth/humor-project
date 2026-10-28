"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertAdmin } from "@/lib/admin/dal";
import { deleteRow, explain, insertRow, parseFields, updateRow } from "@/lib/admin/study/crud";
import { studyActorId } from "@/lib/admin/study/db";
import { getResource } from "@/lib/admin/study/resources";

// Every action opens with assertAdmin(): a Server Action is a public POST
// endpoint. The resource slug arrives from the client, so it is looked up in
// the config and refused if unknown, and the config's ops decide what is
// allowed — a forged call cannot create or delete where the UI does not.

export type RowState = { error?: string; ok?: string };

async function setup(slug: string) {
  const admin = await assertAdmin();
  const r = getResource(slug);
  if (!r) throw new Error("Unknown resource.");
  const actorId = await studyActorId(admin);
  return { r, actorId };
}

const NO_ACTOR = "Your email has no profile in the study database, so the change cannot be attributed. Sign in to the study app once with this account.";

export async function createRow(slug: string, _prev: RowState, formData: FormData): Promise<RowState> {
  const { r, actorId } = await setup(slug);
  if (!r.ops.create) throw new Error("Not allowed.");
  if (!actorId) return { error: NO_ACTOR };
  const values = parseFields(r.fields, formData);
  if (typeof values === "string") return { error: values };

  let id: number;
  try {
    id = (await insertRow(r, values, actorId))!.id;
  } catch (error) {
    return { error: explain(error, r, "write") };
  }
  revalidatePath(`/admin/study/${r.slug}`);
  redirect(`/admin/study/${r.slug}/${id}?created=1`);
}

export async function updateRowAction(slug: string, id: number, _prev: RowState, formData: FormData): Promise<RowState> {
  const { r, actorId } = await setup(slug);
  if (!actorId) return { error: NO_ACTOR };
  const values = parseFields(r.fields, formData);
  if (typeof values === "string") return { error: values };

  try {
    if (!(await updateRow(r, id, values, actorId))) return { error: `That ${r.singular} no longer exists.` };
  } catch (error) {
    return { error: explain(error, r, "write") };
  }
  revalidatePath(`/admin/study/${r.slug}`, "layout");
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
  revalidatePath(`/admin/study/${r.slug}`);
  redirect(`/admin/study/${r.slug}?deleted=1`);
}
