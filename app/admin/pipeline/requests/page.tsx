import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, fullName, num } from "@/lib/admin/format";
import { listRequests, PAGE } from "@/lib/admin/pipeline/read";

export const metadata = { title: "Generation requests · Humor Admin" };

export default async function RequestsPage({ searchParams }: PageProps<"/admin/pipeline/requests">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const rawChain = Number(param(sp.chain));
  const chain = Number.isInteger(rawChain) && rawChain > 0 ? rawChain : null;
  const page = pageParam(sp.page);
  const { rows, total, chains } = await listRequests({ q, chain, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Generation requests</h1>
          <p>
            Every successful press of Generate, the chain that ran and what it wrote. Open one to see each step&rsquo;s
            prompt and answer. Read-only: this is also the rate-limit ledger.
          </p>
        </div>
      </div>

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Search category, topic or joke" aria-label="Search" />
        <select className="ad-select" name="chain" defaultValue={chain ?? ""} aria-label="Chain">
          <option value="">Every chain</option>
          {chains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="ad-btn">Filter</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr><th className="ad-r">#</th><th>What it wrote</th><th>Chain</th><th className="ad-r">Calls</th><th className="ad-r">Time</th><th>Requested by</th><th>Status</th><th>When</th></tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td className="ad-r"><Link href={`/admin/pipeline/requests/${g.id}`} className="ad-row-link">{g.id}</Link></td>
                  <td className="ad-clip">
                    <Link href={`/admin/pipeline/requests/${g.id}`} className="ad-joke"><span className="ad-joke__setup">{g.setup}</span> <span className="ad-joke__punch">{g.punchline}</span></Link>
                    <div className="ad-person__sub">{g.category}{g.prompt ? <> · “{g.prompt}”</> : null}</div>
                  </td>
                  <td>{g.chain_id ? <Link href={`/admin/pipeline/chains/${g.chain_id}`}>{g.chain_name}</Link> : <span className="ad-muted">before chains</span>}</td>
                  <td className="ad-r">{g.steps || <span className="ad-muted">—</span>}</td>
                  <td className="ad-r ad-muted">{g.total_ms != null ? `${num(g.total_ms)} ms` : "—"}</td>
                  <td>{g.user_id ? <Link href={`/admin/users/${g.user_id}`}>{fullName(g.first_name, g.last_name)}</Link> : "—"}</td>
                  <td>{g.posted_id ? <Link className="ad-badge ad-badge--accent" href={`/admin/media/${g.posted_id}`}>Posted #{g.posted_id}</Link> : <span className="ad-badge">Discarded</span>}</td>
                  <td className="ad-muted">{ago(g.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">Nothing here.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE} total={total} path="/admin/pipeline/requests" params={{ ...(q ? { q } : {}), ...(chain ? { chain: String(chain) } : {}) }} />
      </section>
    </>
  );
}
