import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { StepMeta } from "@/components/admin/study-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { listSteps, PAGE } from "@/lib/admin/study/read";

export const metadata = { title: "Prompt chain steps · Humor Admin" };

export default async function StepsPage({ searchParams }: PageProps<"/admin/study/steps">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const modelNum = Number(param(sp.model));
  const model = Number.isInteger(modelNum) && modelNum > 0 ? modelNum : null;
  const page = pageParam(sp.page);
  const { rows, total, models } = await listSteps({ q, model, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Prompt chain steps</h1>
          <p>Every step of every chain, newest chain first. Open a chain to read its steps in order with full prompts. Read-only.</p>
        </div>
      </div>

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Search chain, description or prompt text" aria-label="Search steps" />
        <select className="ad-select" name="model" defaultValue={model ?? ""} aria-label="Model">
          <option value="">All models</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className="ad-btn">Apply</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead><tr><th>Chain</th><th className="ad-r">#</th><th>Step</th><th>System prompt</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="ad-clip"><Link href={`/admin/study/chains/${s.humor_flavor_id}#step-${s.id}`} className="ad-row-link ad-mono">{s.flavor_slug}</Link></td>
                  <td className="ad-r">{s.order_by}</td>
                  <td>
                    {s.description ? <div style={{ marginBottom: 6 }}>{s.description}</div> : null}
                    <StepMeta s={s} />
                  </td>
                  <td className="ad-clip"><span className="ad-clamp ad-muted">{s.llm_system_prompt ?? "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No steps match.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE} total={total} path="/admin/study/steps"
          params={{ ...(q && { q }), ...(model && { model: String(model) }) }} />
      </section>
    </>
  );
}
