import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteRowButton, RowForm } from "@/components/admin/study-forms";
import { requireAdmin } from "@/lib/admin/dal";
import { dateTime } from "@/lib/admin/format";
import { getRow, resolveFields, toValues } from "@/lib/admin/study/crud";
import { getResource } from "@/lib/admin/study/resources";

export async function generateMetadata({ params }: PageProps<"/admin/study/[resource]/[id]">) {
  const r = getResource((await params).resource);
  return { title: `Edit ${r?.singular ?? "row"} · Humor Admin` };
}

export default async function EditRowPage({ params, searchParams }: PageProps<"/admin/study/[resource]/[id]">) {
  await requireAdmin();
  const { resource, id: raw } = await params;
  const r = getResource(resource);
  const id = Number(raw);
  if (!r || !Number.isInteger(id) || id <= 0) notFound();

  const [row, fields, sp] = await Promise.all([getRow(r, id), resolveFields(r), searchParams]);
  if (!row) notFound();
  const values = toValues(r, row);
  const first = r.fields[0];
  const heading = first.type === "select"
    ? fields[0].choices?.find((c) => c.value === values[first.name])?.label
    : String(values[first.name]);

  return (
    <>
      <div className="ad-crumbs"><Link href={`/admin/study/${r.slug}`}>{r.title}</Link> / #{row.id}</div>
      <div className="ad-page-head">
        <div>
          <h1 className="ad-clamp">{heading || `${r.singular} #${row.id}`}</h1>
          <p>
            Created {dateTime(row.created_datetime_utc)}{row.created_by_email ? <> by {row.created_by_email}</> : null}
            {" · "}last changed {dateTime(row.modified_datetime_utc)}{row.modified_by_email ? <> by {row.modified_by_email}</> : null}
          </p>
        </div>
        {r.ops.delete ? <DeleteRowButton slug={r.slug} id={row.id} singular={r.singular} /> : null}
      </div>

      {sp.created ? <div className="ad-notice">Created.</div> : null}

      <section className="ad-card" style={{ maxWidth: 720 }}>
        <RowForm slug={r.slug} id={row.id} fields={fields} values={values} singular={r.singular} />
      </section>
    </>
  );
}
