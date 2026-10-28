import Link from "next/link";
import { notFound } from "next/navigation";

import { Thumb } from "@/components/admin/study-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { dateTime } from "@/lib/admin/format";
import { getRequest } from "@/lib/admin/study/read";

export const metadata = { title: "Generation request · Humor Admin" };

export default async function RequestPage({ params }: PageProps<"/admin/study/requests/[id]">) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = await getRequest(id);
  if (!data) notFound();
  const { request: r, chains, responses, captions } = data;
  const totalSeconds = responses.reduce((a, x) => a + x.processing_time_seconds, 0);

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/study/requests">Generation requests</Link> / #{r.id}</div>
      <div className="ad-page-head">
        <div>
          <h1>Request #{r.id}</h1>
          <p>{dateTime(r.created_datetime_utc)} · {r.requester ?? "unknown requester"}</p>
        </div>
      </div>

      <div className="ad-grid ad-grid--wide-left">
        <div className="ad-stack">
          <section className="ad-card ad-card--flush">
            <div className="ad-card__head" style={{ padding: "16px 16px 0" }}>
              <div>
                <div className="ad-card__title">LLM calls ({responses.length})</div>
                <div className="ad-card__sub">{totalSeconds}s of model time across {chains.length} chain run{chains.length === 1 ? "" : "s"}</div>
              </div>
            </div>
            {responses.length ? (
              <div className="ad-table-wrap">
                <table>
                  <thead><tr><th>Chain</th><th className="ad-r">Step</th><th>Model</th><th className="ad-r">Time</th><th>Response</th></tr></thead>
                  <tbody>
                    {responses.map((x) => (
                      <tr key={x.id}>
                        <td className="ad-clip"><Link href={`/admin/study/chains/${x.humor_flavor_id}`} className="ad-mono">{x.flavor_slug}</Link><div className="ad-person__sub">run #{x.llm_prompt_chain_id ?? "—"}</div></td>
                        <td className="ad-r">{x.step_order ?? "—"}</td>
                        <td>{x.model}</td>
                        <td className="ad-r">{x.processing_time_seconds}s</td>
                        <td className="ad-clip"><Link href={`/admin/study/responses/${x.id}`}><span className="ad-clamp">{x.llm_model_response ?? "(empty)"}</span></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="ad-empty">No LLM calls were logged for this request.</p>}
          </section>

          <section className="ad-card ad-card--flush">
            <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Captions produced ({captions.length})</div></div>
            {captions.length ? (
              <table>
                <tbody>
                  {captions.map((c) => (
                    <tr key={c.id}>
                      <td>{c.content ?? <span className="ad-muted">empty</span>}</td>
                      <td className="ad-clip">{c.flavor_slug ? <Link href={`/admin/study/chains/${c.humor_flavor_id}`} className="ad-mono ad-muted">{c.flavor_slug}</Link> : null}</td>
                      <td className="ad-r ad-muted">{c.like_count} likes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="ad-empty">No captions came out of this request.</p>}
          </section>
        </div>

        <div className="ad-stack">
          <section className="ad-card">
            <Link href={`/admin/study/media/${r.image_id}`}><Thumb url={r.url} size={0} /></Link>
            {r.image_description ? <p className="ad-clamp ad-muted" style={{ marginTop: 12, fontSize: 13 }}>{r.image_description}</p> : null}
          </section>
        </div>
      </div>
    </>
  );
}
