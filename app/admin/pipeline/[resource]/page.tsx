import Link from "next/link";
import { notFound } from "next/navigation";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, num } from "@/lib/admin/format";
import { listRows, PAGE_SIZE } from "@/lib/admin/pipeline/crud";
import { getResource, type Column } from "@/lib/admin/pipeline/resources";

export async function generateMetadata({ params }: PageProps<"/admin/pipeline/[resource]">) {
  const r = getResource((await params).resource);
  return { title: `${r?.title ?? "Pipeline"} · Humor Admin` };
}

export default async function ResourceListPage({ params, searchParams }: PageProps<"/admin/pipeline/[resource]">) {
  await requireAdmin();
  const r = getResource((await params).resource);
  if (!r) notFound();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const page = pageParam(sp.page);
  const { rows, total } = await listRows(r, { q, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>{r.title}</h1>
          <p>{r.blurb}</p>
        </div>
        {r.ops.create ? <Link href={`/admin/pipeline/${r.slug}/new`} className="ad-btn ad-btn--primary">New {r.singular}</Link> : null}
      </div>

      {sp.deleted ? <div className="ad-notice">Deleted.</div> : null}

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder={`Search ${r.title.toLowerCase()}`} aria-label="Search" />
        <button className="ad-btn">Search</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr>{r.columns.map((c) => <th key={c.key} className={c.kind === "num" ? "ad-r" : undefined}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {r.columns.map((c) => <Cell key={c.key} c={c} value={row[c.key]} href={`/admin/pipeline/${r.slug}/${row.id}`} />)}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">{q ? `Nothing matches “${q}”.` : `No ${r.title.toLowerCase()} yet.`}</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} path={`/admin/pipeline/${r.slug}`} params={q ? { q } : {}} />
      </section>
    </>
  );
}

function Cell({ c, value, href }: { c: Column; value: unknown; href: string }) {
  switch (c.kind) {
    case "link":
      return <td className="ad-clip"><Link href={href} className="ad-row-link">{String(value ?? "—")}</Link></td>;
    case "mono":
      return <td className="ad-mono ad-muted">{String(value ?? "—")}</td>;
    case "bool":
      return <td>{value ? <span className="ad-badge ad-badge--accent">yes</span> : <span className="ad-muted">no</span>}</td>;
    case "clip":
      return <td className="ad-clip"><span className="ad-clamp">{String(value ?? "—")}</span></td>;
    case "num":
      return <td className="ad-r">{num(Number(value))}</td>;
    case "ago":
      return <td className="ad-muted">{ago(value as Date)}</td>;
    default:
      return <td>{value == null ? <span className="ad-muted">—</span> : String(value)}</td>;
  }
}
