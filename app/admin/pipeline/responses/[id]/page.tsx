import Link from "next/link";
import { notFound } from "next/navigation";

import { PromptBlock } from "@/components/admin/pipeline-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { dateTime, num } from "@/lib/admin/format";
import { getResponse } from "@/lib/admin/pipeline/read";

export const metadata = { title: "LLM response · Humor Admin" };

export default async function ResponsePage({ params }: PageProps<"/admin/pipeline/responses/[id]">) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const lr = await getResponse(id);
  if (!lr) notFound();

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/pipeline/responses">LLM responses</Link> / #{lr.id}</div>
      <div className="ad-page-head">
        <div>
          <h1>Step {lr.position}: {lr.step_name}</h1>
          <p>
            {dateTime(lr.created_at)} · part of <Link href={`/admin/pipeline/requests/${lr.generation_id}`}>request #{lr.generation_id}</Link>
            {lr.chain_id ? <> · chain <Link href={`/admin/pipeline/chains/${lr.chain_id}`}>{lr.chain_name}</Link></> : null}
          </p>
        </div>
      </div>

      <div className="ad-grid ad-grid--wide-left">
        <div className="ad-stack">
          <PromptBlock label="Response" text={lr.response} open />
          <PromptBlock label="User prompt (as sent)" text={lr.user_prompt} open />
          <PromptBlock label="System prompt" text={lr.system_prompt} />
        </div>
        <section className="ad-card">
          <dl className="ad-facts">
            <dt>Model</dt><dd className="ad-mono">{lr.model}</dd>
            <dt>Temperature</dt><dd>{lr.temperature ?? <span className="ad-muted">model default</span>}</dd>
            <dt>Time</dt><dd>{num(lr.duration_ms)} ms</dd>
            <dt>Step</dt><dd>{lr.step_id ? <Link href={`/admin/pipeline/steps/${lr.step_id}`}>edit this step</Link> : <span className="ad-muted">deleted since</span>}</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
