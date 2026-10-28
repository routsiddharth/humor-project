import Link from "next/link";
import { notFound } from "next/navigation";

import { PromptBlock, StepMeta, Thumb } from "@/components/admin/study-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, dateTime, fixed, num } from "@/lib/admin/format";
import { getChain } from "@/lib/admin/study/read";

export const metadata = { title: "Prompt chain · Humor Admin" };

export default async function ChainPage({ params }: PageProps<"/admin/study/chains/[id]">) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = await getChain(id);
  if (!data) notFound();
  const { chain: c, steps, captions, runs } = data;

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/study/chains">Prompt chains</Link> / #{c.id}</div>
      <div className="ad-page-head">
        <div>
          <h1 className="ad-mono" style={{ overflowWrap: "anywhere" }}>{c.slug}</h1>
          <p>{c.description ?? "No description."}</p>
        </div>
      </div>

      <div className="ad-grid ad-grid--wide-left">
        <div className="ad-stack">
          <h2 className="ad-section-title" style={{ margin: 0 }}>Steps ({steps.length})</h2>
          {steps.length ? steps.map((s) => (
            <section key={s.id} className="ad-card" id={`step-${s.id}`}>
              <div className="ad-card__head">
                <div>
                  <div className="ad-card__title">Step {s.order_by}{s.description ? ` — ${s.description}` : ""}</div>
                  <div style={{ marginTop: 8 }}><StepMeta s={s} /></div>
                </div>
                <span className="ad-muted ad-mono" style={{ fontSize: 12 }}>#{s.id}</span>
              </div>
              <div className="ad-stack" style={{ gap: 8 }}>
                <PromptBlock label="System prompt" text={s.llm_system_prompt} />
                <PromptBlock label="User prompt" text={s.llm_user_prompt} />
              </div>
            </section>
          )) : <section className="ad-card"><p className="ad-empty">This chain has no steps.</p></section>}
        </div>

        <div className="ad-stack">
          <section className="ad-card">
            <dl className="ad-facts">
              <dt>Captions</dt><dd>{num(c.captions)}</dd>
              <dt>LLM calls</dt><dd>{num(runs?.n)} {runs?.avg_seconds != null ? <span className="ad-muted">· {fixed(runs.avg_seconds, 1)}s avg</span> : null}</dd>
              <dt>In the mix</dt><dd>{c.mix != null ? <Link href="/admin/study/mix">{c.mix} per request</Link> : <span className="ad-muted">no</span>}</dd>
              <dt>Pinned</dt><dd>{c.is_pinned ? "yes" : "no"}</dd>
              <dt>Created</dt><dd>{dateTime(c.created_datetime_utc)}{c.created_by ? <span className="ad-muted"> · {c.created_by}</span> : null}</dd>
              <dt>Modified</dt><dd>{dateTime(c.modified_datetime_utc)}</dd>
            </dl>
            <div className="ad-form-actions" style={{ marginTop: 14 }}>
              <Link className="ad-btn ad-btn--sm" href={`/admin/study/responses?flavor=${c.id}`}>Its LLM responses</Link>
            </div>
          </section>

          <section className="ad-card ad-card--flush">
            <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Latest captions</div></div>
            {captions.length ? (
              <table>
                <tbody>
                  {captions.map((cap) => (
                    <tr key={cap.id}>
                      <td style={{ width: 56 }}><Link href={`/admin/study/media/${cap.image_id}`}><Thumb url={cap.url} size={44} /></Link></td>
                      <td>{cap.content ?? <span className="ad-muted">empty</span>}<div className="ad-person__sub">{cap.like_count} likes · {ago(cap.created_datetime_utc)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="ad-empty">No captions from this chain.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
