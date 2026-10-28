import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago } from "@/lib/admin/format";
import { listResponses, PAGE } from "@/lib/admin/study/read";

export const metadata = { title: "LLM responses · Humor Admin" };

function idParam(v: string | string[] | undefined) {
  const n = Number(param(v));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function ResponsesPage({ searchParams }: PageProps<"/admin/study/responses">) {
  await requireAdmin();
  const sp = await searchParams;
  const model = idParam(sp.model);
  const flavor = idParam(sp.flavor);
  const page = pageParam(sp.page);
  const { rows, total, models } = await listResponses({ model, flavor, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>LLM responses</h1>
          <p>The raw log of every model call a prompt chain step made, newest first. Open one for the exact prompts sent. Read-only.</p>
        </div>
      </div>

      <form className="ad-toolbar">
        <select className="ad-select" name="model" defaultValue={model ?? ""} aria-label="Model">
          <option value="">All models</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {flavor ? <input type="hidden" name="flavor" value={flavor} /> : null}
        <button className="ad-btn">Apply</button>
        {flavor ? <Link href={model ? `/admin/study/responses?model=${model}` : "/admin/study/responses"} className="ad-btn ad-btn--sm">Chain #{flavor} ✕</Link> : null}
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead><tr><th>Response</th><th>Chain · step</th><th>Model</th><th className="ad-r">Time</th><th>Request</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td className="ad-clip"><Link href={`/admin/study/responses/${x.id}`} className="ad-row-link"><span className="ad-clamp">{x.llm_model_response ?? "(empty)"}</span></Link></td>
                  <td className="ad-clip"><Link href={`/admin/study/chains/${x.humor_flavor_id}`} className="ad-mono">{x.flavor_slug}</Link>{x.step_order != null ? <span className="ad-muted"> · {x.step_order}</span> : null}</td>
                  <td>{x.model}</td>
                  <td className="ad-r">{x.processing_time_seconds}s</td>
                  <td><Link href={`/admin/study/requests/${x.caption_request_id}`}>#{x.caption_request_id}</Link></td>
                  <td className="ad-muted">{ago(x.created_datetime_utc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No responses match.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE} total={total} path="/admin/study/responses"
          params={{ ...(model && { model: String(model) }), ...(flavor && { flavor: String(flavor) }) }} />
      </section>
    </>
  );
}
