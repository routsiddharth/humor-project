import Link from "next/link";
import { notFound } from "next/navigation";

import { RowForm } from "@/components/admin/study-forms";
import { requireAdmin } from "@/lib/admin/dal";
import { resolveFields, toValues } from "@/lib/admin/study/crud";
import { getResource } from "@/lib/admin/study/resources";

export async function generateMetadata({ params }: PageProps<"/admin/study/[resource]/new">) {
  const r = getResource((await params).resource);
  return { title: `New ${r?.singular ?? "row"} · Humor Admin` };
}

export default async function NewRowPage({ params }: PageProps<"/admin/study/[resource]/new">) {
  await requireAdmin();
  const r = getResource((await params).resource);
  if (!r || !r.ops.create) notFound();
  const fields = await resolveFields(r);

  return (
    <>
      <div className="ad-crumbs"><Link href={`/admin/study/${r.slug}`}>{r.title}</Link> /</div>
      <div className="ad-page-head">
        <div>
          <h1>New {r.singular}</h1>
          <p>{r.blurb}</p>
        </div>
      </div>
      <section className="ad-card" style={{ maxWidth: 720 }}>
        <RowForm slug={r.slug} fields={fields} values={toValues(r, null)} singular={r.singular} />
      </section>
    </>
  );
}
