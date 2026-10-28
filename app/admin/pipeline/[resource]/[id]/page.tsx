import Link from "next/link";
import { notFound } from "next/navigation";

import { PromptBlock } from "@/components/admin/pipeline-bits";
import { DeleteRowButton, RowForm, TestRunForm } from "@/components/admin/pipeline-forms";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, dateTime, num } from "@/lib/admin/format";
import { getRow, resolveFields, toValues } from "@/lib/admin/pipeline/crud";
import { getChainSteps } from "@/lib/admin/pipeline/read";
import { getResource } from "@/lib/admin/pipeline/resources";
import { listPickableModels } from "@/lib/chain";

export async function generateMetadata({ params }: PageProps<"/admin/pipeline/[resource]/[id]">) {
  const r = getResource((await params).resource);
  return { title: `Edit ${r?.singular ?? "row"} · Humor Admin` };
}

export default async function EditRowPage({ params, searchParams }: PageProps<"/admin/pipeline/[resource]/[id]">) {
  await requireAdmin();
  const { resource, id: raw } = await params;
  const r = getResource(resource);
  const id = Number(raw);
  if (!r || !Number.isInteger(id) || id <= 0) notFound();

  const [row, fields, sp] = await Promise.all([getRow(r, id), resolveFields(r), searchParams]);
  if (!row) notFound();

  // A chain's page is also where it is watched working: its steps in order, a
  // test run, and the last few real runs.
  const chainId = r.slug === "chains" ? row.id : r.slug === "mix" ? Number(row.chain_id) : null;
  const [chain, pickable] = r.slug === "chains"
    ? await Promise.all([getChainSteps(row.id), listPickableModels()])
    : [null, []];

  return (
    <>
      <div className="ad-crumbs"><Link href={`/admin/pipeline/${r.slug}`}>{r.title}</Link> / #{row.id}</div>
      <div className="ad-page-head">
        <div>
          <h1 className="ad-clamp">{row.heading || `${r.singular} #${row.id}`}</h1>
          <p>
            Created {dateTime(row.created_at)}{row.created_by_email ? <> by {row.created_by_email}</> : null}
            {" · "}last changed {dateTime(row.updated_at)}{row.updated_by_email ? <> by {row.updated_by_email}</> : null}
            {r.slug === "steps" ? <> · <Link href={`/admin/pipeline/chains/${row.chain_id}`}>open its chain</Link></> : null}
            {r.slug === "mix" && chainId ? <> · <Link href={`/admin/pipeline/chains/${chainId}`}>open the chain</Link></> : null}
          </p>
        </div>
        {r.ops.delete ? <DeleteRowButton slug={r.slug} id={row.id} singular={r.singular} /> : null}
      </div>

      {sp.created ? <div className="ad-notice">Created.</div> : null}

      {chain ? (
        <div className="ad-grid ad-grid--wide-left">
          <div className="ad-stack">
            <section className="ad-card">
              <div className="ad-card__head">
                <div className="ad-card__title">Steps ({chain.steps.length})</div>
                <Link className="ad-btn" href={`/admin/pipeline/steps/new?chain_id=${row.id}&position=${(chain.steps.at(-1)?.position ?? 0) + 1}`}>Add step</Link>
              </div>
              {chain.steps.length ? (
                <ol className="ad-steps">
                  {chain.steps.map((s, i) => (
                    <li key={s.id} className={`ad-step${i === chain.steps.length - 1 ? " ad-step--final" : ""}`}>
                      <span className="ad-step__num">{s.position}</span>
                      <div className="ad-step__body">
                        <div className="ad-step__head">
                          <Link className="ad-step__name" href={`/admin/pipeline/steps/${s.id}`}>{s.name}</Link>
                          <span className="ad-badges">
                            <span className="ad-badge ad-badge--accent">{s.provider_model_id}</span>
                            {s.temperature != null ? <span className="ad-badge">temp {s.temperature}</span> : null}
                            <span className="ad-badge">{i === chain.steps.length - 1 ? "→ joke" : "→ text"}</span>
                            {s.calls ? <span className="ad-badge">{num(s.calls)} calls · avg {num(s.avg_ms)} ms</span> : null}
                          </span>
                        </div>
                        <PromptBlock label="System prompt" text={s.system_prompt} />
                        <PromptBlock label="User prompt" text={s.user_prompt} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="ad-empty">No steps yet, so the mix will never pick this chain. Add one.</p>
              )}
            </section>

            <section className="ad-card">
              <div className="ad-card__head"><div className="ad-card__title">Test run</div></div>
              <TestRunForm chainId={row.id} categories={chain.categories}
                models={pickable.map((m) => ({ id: m.id, label: `${m.name} · ${m.providerModelId}` }))} />
            </section>
          </div>

          <div className="ad-stack">
            <section className="ad-card">
              <div className="ad-card__head"><div className="ad-card__title">Edit</div></div>
              <RowForm slug={r.slug} id={row.id} fields={fields} values={toValues(r, row)} singular={r.singular} />
            </section>
            <section className="ad-card">
              <div className="ad-card__head">
                <div className="ad-card__title">Recent runs</div>
                <Link href={`/admin/pipeline/requests?chain=${row.id}`}>All</Link>
              </div>
              {chain.runs.length ? (
                <ul className="ad-list">
                  {chain.runs.map((g) => (
                    <li key={g.id}>
                      <Link href={`/admin/pipeline/requests/${g.id}`} className="ad-joke">
                        <span className="ad-joke__setup">{g.setup}</span> <span className="ad-joke__punch">{g.punchline}</span>
                      </Link>
                      <div className="ad-person__sub">{g.category} · {g.steps} calls · {num(g.total_ms)} ms · {ago(g.created_at)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ad-empty">Not run yet.</p>
              )}
            </section>
          </div>
        </div>
      ) : (
        <section className="ad-card" style={{ maxWidth: 820 }}>
          <RowForm slug={r.slug} id={row.id} fields={fields} values={toValues(r, row)} singular={r.singular} />
        </section>
      )}
    </>
  );
}
