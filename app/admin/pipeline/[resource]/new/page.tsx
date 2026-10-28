import Link from "next/link";
import { notFound } from "next/navigation";

import { param } from "@/components/admin/bits";
import { RowForm } from "@/components/admin/pipeline-forms";
import { requireAdmin } from "@/lib/admin/dal";
import { resolveFields, toValues } from "@/lib/admin/pipeline/crud";
import { getResource } from "@/lib/admin/pipeline/resources";

export async function generateMetadata({ params }: PageProps<"/admin/pipeline/[resource]/new">) {
  const r = getResource((await params).resource);
  return { title: `New ${r?.singular ?? "row"} · Humor Admin` };
}

export default async function NewRowPage({ params, searchParams }: PageProps<"/admin/pipeline/[resource]/new">) {
  await requireAdmin();
  const r = getResource((await params).resource);
  if (!r || !r.ops.create) notFound();
  const [fields, sp] = await Promise.all([resolveFields(r), searchParams]);
  // ?chain_id=4&position=3 from a chain's "Add step" link. toValues only takes
  // names the resource has, and the form is validated on save like any other.
  const preset = Object.fromEntries(r.fields.map((f) => [f.name, param(sp[f.name])]).filter(([, v]) => v));

  return (
    <>
      <div className="ad-crumbs"><Link href={`/admin/pipeline/${r.slug}`}>{r.title}</Link> /</div>
      <div className="ad-page-head">
        <div>
          <h1>New {r.singular}</h1>
          <p>{r.blurb}</p>
        </div>
      </div>
      <section className="ad-card" style={{ maxWidth: 820 }}>
        <RowForm slug={r.slug} fields={fields} values={toValues(r, null, preset)} singular={r.singular} />
      </section>
    </>
  );
}
