import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, fullName } from "@/lib/admin/format";
import { listGenerations, PAGE_SIZE } from "@/lib/admin/media";

export const metadata = { title: "Generation ledger · Humor Admin" };

const STATUSES = { all: "All", posted: "Posted", unposted: "Discarded" } as const;

export default async function GenerationsPage({ searchParams }: PageProps<"/admin/media/generations">) {
  await requireAdmin();
  const sp = await searchParams;
  const s = param(sp.status, "all");
  const status = (s in STATUSES ? s : "all") as keyof typeof STATUSES;
  const page = pageParam(sp.page);
  const { rows, total } = await listGenerations({ page, status });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Generation ledger</h1>
          <p>Every call to Gemini, including drafts nobody posted. Read-only: the ledger is the rate-limit record, so its rows are never edited.</p>
        </div>
        <div className="ad-form-actions">
          <div className="ad-tabs">
            <Link href="/admin/media">Posts</Link>
            <Link href="/admin/media/generations" aria-current="page">Generation ledger</Link>
          </div>
        </div>
      </div>

      <div className="ad-toolbar">
        <div className="ad-tabs">
          {Object.entries(STATUSES).map(([k, v]) => (
            <Link key={k} href={`/admin/media/generations?status=${k}`} aria-current={status === k ? "page" : undefined}>{v}</Link>
          ))}
        </div>
      </div>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead><tr><th className="ad-r">#</th><th>What Gemini wrote</th><th>Prompt</th><th>Model</th><th>Requested by</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td className="ad-r ad-muted">{g.id}</td>
                  <td className="ad-clip"><span className="ad-joke"><span className="ad-joke__setup">{g.setup}</span> <span className="ad-joke__punch">{g.punchline}</span></span><div className="ad-person__sub">{g.category}</div></td>
                  <td>{g.prompt ? `“${g.prompt}”` : <span className="ad-muted">—</span>}</td>
                  <td className="ad-mono ad-muted" style={{ fontSize: 12 }}>{g.model}</td>
                  <td><Link href={`/admin/users/${g.user_id}`}>{fullName(g.first_name, g.last_name)}</Link></td>
                  <td>{g.posted_id ? <Link className="ad-badge ad-badge--accent" href={`/admin/media/${g.posted_id}`}>Posted #{g.posted_id}</Link> : <span className="ad-badge">Discarded</span>}</td>
                  <td className="ad-muted">{ago(g.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">Nothing here.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} path="/admin/media/generations" params={{ status }} />
      </section>
    </>
  );
}
