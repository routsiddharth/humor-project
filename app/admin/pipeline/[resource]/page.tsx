import Link from "next/link";
import { notFound } from "next/navigation";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { ExpandableRows, InlineCreate } from "@/components/admin/pipeline-inline";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, dateTime, num } from "@/lib/admin/format";
import { getRowsByIds, listRows, PAGE_SIZE, resolveFields, toValues } from "@/lib/admin/pipeline/crud";
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
  const [{ rows, total }, fields] = await Promise.all([listRows(r, { q, page }), resolveFields(r)]);
  // Chains open onto their own page, where their steps are edited; every
  // other table edits a row right under it in the list.
  const hub = r.slug === "chains";
  const stored = await getRowsByIds(r, hub ? [] : rows.map((row) => row.id));

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>{r.title}</h1>
          <p>{r.blurb}</p>
        </div>
      </div>

      {r.ops.create ? (
        <InlineCreate slug={r.slug} singular={r.singular} fields={fields} values={toValues(r, null)}
          openPrefix={hub ? "/admin/pipeline/chains/" : undefined} />
      ) : null}

      {sp.deleted ? <div className="ad-notice">Deleted.</div> : null}

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder={`Search ${r.title.toLowerCase()}`} aria-label="Search" />
        <button className="ad-btn">Search</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr>
                {hub ? null : <th aria-label="Edit" style={{ width: 28 }} />}
                {r.columns.map((c) => <th key={c.key} className={c.kind === "num" ? "ad-r" : undefined}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {hub ? rows.map((row) => (
                <tr key={row.id}>
                  {r.columns.map((c) => <Cell key={c.key} c={c} value={row[c.key]} href={`/admin/pipeline/${r.slug}/${row.id}`} />)}
                </tr>
              )) : (
                <ExpandableRows slug={r.slug} singular={r.singular} fields={fields} span={r.columns.length} canDelete={r.ops.delete}
                  rows={rows.map((row) => {
                    const full = stored.get(row.id);
                    return {
                      id: row.id,
                      cells: r.columns.map((c) => <Cell key={c.key} c={c} value={row[c.key]} />),
                      values: toValues(r, full ?? null),
                      meta: full ? `Created ${dateTime(full.created_at)}${full.created_by_email ? ` by ${full.created_by_email}` : ""}`
                        + ` · changed ${dateTime(full.updated_at)}${full.updated_by_email ? ` by ${full.updated_by_email}` : ""}` : "",
                    };
                  })} />
              )}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">{q ? `Nothing matches “${q}”.` : `No ${r.title.toLowerCase()} yet.`}</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} path={`/admin/pipeline/${r.slug}`} params={q ? { q } : {}} />
      </section>
    </>
  );
}

function Cell({ c, value, href }: { c: Column; value: unknown; href?: string }) {
  switch (c.kind) {
    case "link":
      return href
        ? <td className="ad-clip"><Link href={href} className="ad-row-link">{String(value ?? "—")}</Link></td>
        : <td className="ad-clip"><span className="ad-row-link">{String(value ?? "—")}</span></td>;
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
