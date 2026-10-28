import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, num } from "@/lib/admin/format";
import { listChains, PAGE } from "@/lib/admin/study/read";

export const metadata = { title: "Prompt chains · Humor Admin" };

export default async function ChainsPage({ searchParams }: PageProps<"/admin/study/chains">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const page = pageParam(sp.page);
  const { rows, total } = await listChains({ q, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Prompt chains</h1>
          <p>Each chain (a “humor flavor”) is an ordered list of LLM steps that turns an image into captions. Read-only.</p>
        </div>
        <Link href="/admin/study/mix" className="ad-btn">Edit the mix</Link>
      </div>

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Search slug or description" aria-label="Search chains" />
        <button className="ad-btn">Search</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr><th>Chain</th><th>Description</th><th className="ad-r">Steps</th><th className="ad-r">Captions</th><th>In mix</th><th>Modified</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="ad-clip">
                    <Link href={`/admin/study/chains/${c.id}`} className="ad-row-link ad-mono">{c.slug}</Link>
                    {c.is_pinned ? <> <span className="ad-badge">pinned</span></> : null}
                  </td>
                  <td className="ad-clip"><span className="ad-clamp">{c.description ?? "—"}</span></td>
                  <td className="ad-r">{c.steps}</td>
                  <td className="ad-r">{num(c.captions)}</td>
                  <td>{c.mix != null ? <span className="ad-badge ad-badge--accent">{c.mix} per request</span> : <span className="ad-muted">—</span>}</td>
                  <td className="ad-muted">{ago(c.modified_datetime_utc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No chains match “{q}”.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE} total={total} path="/admin/study/chains" params={q ? { q } : {}} />
      </section>
    </>
  );
}
