import Link from "next/link";
import { notFound } from "next/navigation";

import { PromptBlock } from "@/components/admin/study-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { dateTime } from "@/lib/admin/format";
import { UUID_RE } from "@/lib/admin/study/fields";
import { getResponse } from "@/lib/admin/study/read";

export const metadata = { title: "LLM response · Humor Admin" };

export default async function ResponsePage({ params }: PageProps<"/admin/study/responses/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const x = await getResponse(id);
  if (!x) notFound();

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/study/responses">LLM responses</Link> / response</div>
      <div className="ad-page-head">
        <div>
          <h1>{x.model} · {x.processing_time_seconds}s</h1>
          <p className="ad-mono">{x.id}</p>
        </div>
      </div>

      <div className="ad-grid ad-grid--wide-left">
        <div className="ad-stack">
          <section className="ad-card">
            <div className="ad-card__head"><div className="ad-card__title">Response</div></div>
            <pre className="ad-pre">{x.llm_model_response ?? "(empty)"}</pre>
          </section>
          <section className="ad-card ad-stack" style={{ gap: 8 }}>
            <PromptBlock label="System prompt" text={x.llm_system_prompt} />
            <PromptBlock label="User prompt" text={x.llm_user_prompt} open />
          </section>
        </div>
        <section className="ad-card" style={{ alignSelf: "start" }}>
          <dl className="ad-facts">
            <dt>When</dt><dd>{dateTime(x.created_datetime_utc)}</dd>
            <dt>Chain</dt><dd><Link href={`/admin/study/chains/${x.humor_flavor_id}`} className="ad-mono">{x.flavor_slug}</Link></dd>
            <dt>Step</dt><dd>{x.humor_flavor_step_id ? <Link href={`/admin/study/chains/${x.humor_flavor_id}#step-${x.humor_flavor_step_id}`}>{x.step_order ?? "?"}</Link> : "—"}</dd>
            <dt>Chain run</dt><dd>{x.llm_prompt_chain_id ? `#${x.llm_prompt_chain_id}` : "—"}</dd>
            <dt>Request</dt><dd><Link href={`/admin/study/requests/${x.caption_request_id}`}>#{x.caption_request_id}</Link></dd>
            <dt>Requester</dt><dd>{x.requester ?? "—"}</dd>
            <dt>Temperature</dt><dd>{x.llm_temperature ?? <span className="ad-muted">default</span>}</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
