import Link from "next/link";
import { notFound } from "next/navigation";

import { Trace } from "@/components/admin/pipeline-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { dateTime, fullName, num } from "@/lib/admin/format";
import { getRequest } from "@/lib/admin/pipeline/read";

export const metadata = { title: "Generation request · Humor Admin" };

export default async function RequestPage({ params }: PageProps<"/admin/pipeline/requests/[id]">) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = await getRequest(id);
  if (!data) notFound();
  const { request: g, trace } = data;

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/pipeline/requests">Generation requests</Link> / #{g.id}</div>
      <div className="ad-page-head">
        <div>
          <h1>Request #{g.id}</h1>
          <p>
            {dateTime(g.created_at)} · by {g.user_id ? <Link href={`/admin/users/${g.user_id}`}>{fullName(g.first_name, g.last_name)}</Link> : "—"}
            {" · "}{g.chain_id ? <>chain <Link href={`/admin/pipeline/chains/${g.chain_id}`}>{g.chain_name}</Link></> : "no chain recorded"}
          </p>
        </div>
      </div>

      <div className="ad-grid ad-grid--wide-left">
        <section className="ad-card">
          <div className="ad-card__head"><div className="ad-card__title">Trace ({trace.length} {trace.length === 1 ? "call" : "calls"})</div></div>
          {trace.length ? (
            <Trace items={trace.map((t) => ({
              position: t.position, stepName: t.step_name, model: t.model, temperature: t.temperature,
              systemPrompt: t.system_prompt, userPrompt: t.user_prompt, response: t.response,
              durationMs: t.duration_ms, responseId: t.id,
            }))} />
          ) : (
            <p className="ad-empty">No trace. This request ran before prompt chains, or its trace could not be saved.</p>
          )}
        </section>

        <div className="ad-stack">
          <section className="ad-card">
            <div className="ad-quote"><p>{g.setup}</p><p>{g.punchline}</p></div>
          </section>
          <section className="ad-card">
            <dl className="ad-facts">
              <dt>Category</dt><dd>{g.category}</dd>
              <dt>Topic</dt><dd>{g.prompt ? `“${g.prompt}”` : <span className="ad-muted">none</span>}</dd>
              <dt>Picked</dt><dd>{g.picked_model ?? <span className="ad-muted">Auto</span>}</dd>
              <dt>Style</dt><dd>{g.chain_picked ? "chosen by the user" : <span className="ad-muted">drawn from the mix</span>}</dd>
              <dt>Final model</dt><dd className="ad-mono">{g.model}</dd>
              <dt>Total time</dt><dd>{g.total_ms != null ? `${num(g.total_ms)} ms` : "—"}</dd>
              <dt>Status</dt><dd>{g.posted_id ? <Link href={`/admin/media/${g.posted_id}`}>Posted as #{g.posted_id}</Link> : "Discarded"}</dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
