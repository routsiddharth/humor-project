import "server-only";

import { assertAdmin } from "@/lib/admin/dal";
import { one, query } from "@/lib/admin/study/db";
import { UUID_RE, type Choice, type Field, type ResolvedField, type RowValues } from "@/lib/admin/study/fields";
import { OPTION_SOURCES, type Resource } from "@/lib/admin/study/resources";

// Generic reads and writes for the resources in lib/admin/study/resources.ts.
// SQL identifiers come only from that config; values are always parameters.

export const PAGE_SIZE = 50;

export type ListRow = Record<string, unknown> & { id: number };

export async function listRows(r: Resource, { q, page }: { q: string; page: number }) {
  await assertAdmin();
  const where = q ? `where ${r.search.map((s) => `${s}::text ilike $1`).join(" or ")}` : "";
  const params = q ? [`%${q}%`] : [];
  const cols = r.columns.map((c) => `${c.sql} as "${c.key}"`).join(", ");
  const [rows, count] = await Promise.all([
    query<ListRow>(
      `select ${r.idSql}::int as id, ${cols} from ${r.from} ${where}
        order by ${r.order} limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    one<{ n: number }>(`select count(*)::int as n from ${r.from} ${where}`, params),
  ]);
  return { rows, total: count?.n ?? 0 };
}

export type StoredRow = Record<string, unknown> & {
  id: number;
  created_datetime_utc: Date;
  modified_datetime_utc: Date;
  created_by_email: string | null;
  modified_by_email: string | null;
};

export async function getRow(r: Resource, id: number) {
  await assertAdmin();
  return one<StoredRow>(
    `select r.*, cp.email as created_by_email, mp.email as modified_by_email
       from public.${r.table} r
       left join public.profiles cp on cp.id = r.created_by_user_id
       left join public.profiles mp on mp.id = r.modified_by_user_id
      where r.id = $1`,
    [id],
  );
}

export async function resolveFields(r: Resource): Promise<ResolvedField[]> {
  await assertAdmin();
  return Promise.all(
    r.fields.map(async (f) => (f.options ? { ...f, choices: await query<Choice>(OPTION_SOURCES[f.options]) } : f)),
  );
}

// A stored row as the form's initial values.
export function toValues(r: Resource, row: StoredRow | null): RowValues {
  return Object.fromEntries(
    r.fields.map((f) => {
      const v = row?.[f.name];
      if (f.type === "bool") return [f.name, v === true];
      return [f.name, v == null ? (row ? "" : f.default ?? "") : String(v)];
    }),
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// FormData → column values, or the first readable problem.
export function parseFields(fields: Field[], formData: FormData): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "bool") {
      out[f.name] = formData.get(f.name) === "on";
      continue;
    }
    let v = String(formData.get(f.name) ?? "").trim();
    if (!v) {
      if (f.required) return `${f.label} is required.`;
      out[f.name] = null;
      continue;
    }
    switch (f.type) {
      case "int": {
        const n = Number(v);
        if (!Number.isInteger(n)) return `${f.label} must be a whole number.`;
        if (f.min != null && n < f.min) return `${f.label} must be at least ${f.min}.`;
        if (f.max != null && n > f.max) return `${f.label} must be at most ${f.max}.`;
        out[f.name] = n;
        continue;
      }
      case "select":
        if (!/^\d+$/.test(v)) return `Pick a ${f.label.toLowerCase()}.`;
        out[f.name] = Number(v);
        continue;
      case "email":
        v = v.toLowerCase();
        if (!EMAIL.test(v)) return "That is not an email address.";
        break;
      case "domain":
        v = v.toLowerCase().replace(/^https?:\/\//, "").replace(/^@/, "").replace(/\/.*$/, "");
        if (!DOMAIN.test(v)) return "That is not a domain — something like columbia.edu.";
        break;
      case "uuid":
        if (!UUID_RE.test(v)) return `${f.label} must be a UUID.`;
        v = v.toLowerCase();
        break;
    }
    if (f.max != null && v.length > f.max) return `${f.label} is ${f.max} characters at most.`;
    out[f.name] = v;
  }
  return out;
}

// Postgres errors a form can explain. Anything else is rethrown.
export function explain(error: unknown, r: Resource, op: "write" | "delete"): string {
  const e = error as { code?: string; detail?: string; constraint?: string };
  if (e.code === "23505") return `That ${r.singular} already exists.`;
  if (e.code === "23503") {
    if (op === "delete") {
      const table = e.detail?.match(/from table "([^"]+)"/)?.[1];
      return `This ${r.singular} is still used${table ? ` by rows in ${table}` : ""}, so it cannot be deleted. Point those at something else first.`;
    }
    return e.detail?.includes("images") ? "No image has that id." : "One of the linked records does not exist.";
  }
  if (e.code === "22P02") return "One of the values is not in the right format.";
  throw error;
}

export async function insertRow(r: Resource, values: Record<string, unknown>, actorId: string) {
  const cols = Object.keys(values);
  const params = [...Object.values(values), actorId];
  const n = params.length;
  return one<{ id: number }>(
    `insert into public.${r.table} (${cols.join(", ")}, created_by_user_id, modified_by_user_id)
     values (${cols.map((_, i) => `$${i + 1}`).join(", ")}, $${n}, $${n}) returning id::int`,
    params,
  );
}

export async function updateRow(r: Resource, id: number, values: Record<string, unknown>, actorId: string) {
  const cols = Object.keys(values);
  const params = [id, ...Object.values(values), actorId];
  return one<{ id: number }>(
    `update public.${r.table}
        set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, modified_by_user_id = $${params.length}
      where id = $1 returning id::int`,
    params,
  );
}

export async function deleteRow(r: Resource, id: number) {
  return one<{ id: number }>(`delete from public.${r.table} where id = $1 returning id::int`, [id]);
}
