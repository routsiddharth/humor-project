import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { Thumb } from "@/components/admin/study-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, num } from "@/lib/admin/format";
import { listRequests, PAGE } from "@/lib/admin/study/read";

export const metadata = { title: "Generation requests · Humor Admin" };

export default async function RequestsPage({ searchParams }: PageProps<"/admin/study/requests">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const page = pageParam(sp.page);
  const { rows, total } = await listRequests({ q, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Generation requests</h1>
          <p>Each request asks the mix of prompt chains to caption one image. Open one to trace every LLM call and caption it produced. Read-only.</p>
        </div>
      </div>

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Request # or requester email" aria-label="Search requests" />
        <button className="ad-btn">Search</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr><th>Request</th><th>Image</th><th>Requested by</th><th className="ad-r">Chain runs</th><th className="ad-r">LLM calls</th><th className="ad-r">Captions</th><th>When</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/study/requests/${r.id}`} className="ad-row-link">#{r.id}</Link></td>
                  <td><Link href={`/admin/study/media/${r.image_id}`}><Thumb url={r.url} size={40} /></Link></td>
                  <td>{r.requester ?? <span className="ad-muted">—</span>}</td>
                  <td className="ad-r">{num(r.chains)}</td>
                  <td className="ad-r">{num(r.responses)}</td>
                  <td className="ad-r">{num(r.captions)}</td>
                  <td className="ad-muted">{ago(r.created_datetime_utc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No requests match.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE} total={total} path="/admin/study/requests" params={q ? { q } : {}} />
      </section>
    </>
  );
}
