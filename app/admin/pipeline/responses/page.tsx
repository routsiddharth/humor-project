import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, num } from "@/lib/admin/format";
import { listResponses, PAGE } from "@/lib/admin/pipeline/read";

export const metadata = { title: "LLM responses · Humor Admin" };

export default async function ResponsesPage({ searchParams }: PageProps<"/admin/pipeline/responses">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const page = pageParam(sp.page);
  const { rows, total } = await listResponses({ q, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>LLM responses</h1>
          <p>Every model call a chain has made, newest first, with the prompts exactly as they were sent. Read-only.</p>
        </div>
      </div>

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Search responses, steps or models" aria-label="Search" />
        <button className="ad-btn">Search</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr><th>Response</th><th>Step</th><th>Chain</th><th>Model</th><th className="ad-r">Time</th><th>Request</th><th>When</th></tr>
            </thead>
            <tbody>
              {rows.map((lr) => (
                <tr key={lr.id}>
                  <td className="ad-clip"><Link href={`/admin/pipeline/responses/${lr.id}`} className="ad-row-link"><span className="ad-clamp">{lr.response}</span></Link></td>
                  <td>{lr.position}. {lr.step_name}</td>
                  <td>{lr.chain_id ? <Link href={`/admin/pipeline/chains/${lr.chain_id}`}>{lr.chain_name}</Link> : <span className="ad-muted">deleted</span>}</td>
                  <td className="ad-mono ad-muted" style={{ fontSize: 12 }}>{lr.model}</td>
                  <td className="ad-r ad-muted">{num(lr.duration_ms)} ms</td>
                  <td><Link href={`/admin/pipeline/requests/${lr.generation_id}`}>#{lr.generation_id}</Link></td>
                  <td className="ad-muted">{ago(lr.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">{q ? `Nothing matches “${q}”.` : "No calls yet. Press Generate once."}</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE} total={total} path="/admin/pipeline/responses" params={q ? { q } : {}} />
      </section>
    </>
  );
}
