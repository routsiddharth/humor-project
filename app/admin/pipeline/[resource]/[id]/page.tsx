import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeleteRowButton, RowForm, TestRunForm } from "@/components/admin/pipeline-forms";
import { StepList } from "@/components/admin/pipeline-inline";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, dateTime, num } from "@/lib/admin/format";
import { getRow, resolveFields, toValues } from "@/lib/admin/pipeline/crud";
import { getChainSteps } from "@/lib/admin/pipeline/read";
import { getResource, PLACEHOLDER_HINT, RESOURCES } from "@/lib/admin/pipeline/resources";
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

  // Steps and mix entries are edited on their chain's page, so their own
  // pages (still linked from traces and old bookmarks) hand over to it.
  if (r.slug === "steps") redirect(`/admin/pipeline/chains/${row.chain_id}#step-${row.id}`);
  if (r.slug === "mix") redirect(`/admin/pipeline/chains/${row.chain_id}`);

  // A chain's page is where it is edited and watched working: every step as
  // a form in order, its mix weight, a test run, and the last few real runs.
  const [chain, pickable, stepFields, mixFields] = r.slug === "chains"
    ? await Promise.all([getChainSteps(row.id), listPickableModels(), resolveFields(RESOURCES.steps), resolveFields(RESOURCES.mix)])
    : [null, [], [], []];
  const models = stepFields.find((f) => f.name === "model_id")?.choices ?? [];

  return (
    <>
      <div className="ad-crumbs"><Link href={`/admin/pipeline/${r.slug}`}>{r.title}</Link> / #{row.id}</div>
      <div className="ad-page-head">
        <div>
          <h1 className="ad-clamp">{row.heading || `${r.singular} #${row.id}`}</h1>
          <p>
            Created {dateTime(row.created_at)}{row.created_by_email ? <> by {row.created_by_email}</> : null}
            {" · "}last changed {dateTime(row.updated_at)}{row.updated_by_email ? <> by {row.updated_by_email}</> : null}
          </p>
        </div>
        {r.ops.delete ? <DeleteRowButton slug={r.slug} id={row.id} singular={r.singular} /> : null}
      </div>

      {sp.created ? <div className="ad-notice">Created.</div> : null}

      {chain ? (
        <div className="ad-grid ad-grid--wide-left">
          <div className="ad-stack">
            <StepList chainId={row.id} models={models} placeholders={PLACEHOLDER_HINT}
              steps={chain.steps.map((st) => ({
                id: st.id, position: st.position, name: st.name, model_id: st.model_id, temperature: st.temperature,
                system_prompt: st.system_prompt, user_prompt: st.user_prompt,
                version: new Date(st.updated_at).toISOString(), saved: `changed ${ago(st.updated_at)}`,
                stats: st.calls ? `${num(st.calls)} calls · avg ${num(st.avg_ms)} ms` : null,
              }))} />

            <section className="ad-card">
              <div className="ad-card__head"><div className="ad-card__title">Test run</div></div>
              <TestRunForm chainId={row.id} categories={chain.categories}
                models={pickable.map((m) => ({ id: m.id, label: `${m.name} · ${m.providerModelId}` }))} />
            </section>
          </div>

          <div className="ad-stack">
            <section className="ad-card">
              <div className="ad-card__head"><div className="ad-card__title">Chain</div></div>
              <RowForm slug={r.slug} id={row.id} fields={fields} values={toValues(r, row)} singular={r.singular} />
            </section>
            {chain.mix ? (
              <section className="ad-card">
                <div className="ad-card__head">
                  <div className="ad-card__title">Mix weight</div>
                  <span className="ad-muted" style={{ fontSize: 12 }}>
                    {chain.mix.weight && chain.mix.total
                      ? `${Math.round((100 * chain.mix.weight) / chain.mix.total)}% of the mix`
                      : "off"}
                  </span>
                </div>
                <RowForm slug="mix" id={chain.mix.id} fields={mixFields} values={{ weight: String(chain.mix.weight) }} singular="mix entry" />
              </section>
            ) : null}
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
