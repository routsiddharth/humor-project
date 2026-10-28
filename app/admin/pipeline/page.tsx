import Link from "next/link";

import { requireAdmin } from "@/lib/admin/dal";
import { num } from "@/lib/admin/format";
import { getPipelineCounts } from "@/lib/admin/pipeline/read";

export const metadata = { title: "Pipeline · Humor Admin" };

const TABLES = [
  { href: "/admin/users", key: "users", label: "Users", table: "profiles", ops: "read" },
  { href: "/admin/pipeline/chains", key: "chains", label: "Prompt chains", table: "prompt_chains", ops: "create · read · update · delete" },
  { href: "/admin/pipeline/steps", key: "steps", label: "Prompt chain steps", table: "prompt_chain_steps", ops: "create · read · update · delete" },
  { href: "/admin/pipeline/mix", key: "mix", label: "Prompt chain mix", table: "prompt_chain_mix", ops: "read · update", note: "switched on" },
  { href: "/admin/pipeline/terms", key: "terms", label: "Terms", table: "terms", ops: "create · read · update · delete" },
  { href: "/admin/media", key: "media", label: "AI media", table: "jokes where source = 'ai'", ops: "read · update · delete" },
  { href: "/admin/pipeline/requests", key: "requests", label: "Generation requests", table: "generations", ops: "read" },
  { href: "/admin/pipeline/examples", key: "examples", label: "Generation examples", table: "generation_examples", ops: "create · read · update · delete" },
  { href: "/admin/pipeline/models", key: "models", label: "LLM models", table: "llm_models", ops: "create · read · update · delete" },
  { href: "/admin/pipeline/providers", key: "providers", label: "LLM providers", table: "llm_providers", ops: "create · read · update · delete" },
  { href: "/admin/pipeline/responses", key: "responses", label: "LLM responses", table: "llm_responses", ops: "read" },
  { href: "/admin/pipeline/domains", key: "domains", label: "Allowed signup domains", table: "allowed_signup_domains", ops: "create · read · update · delete" },
  { href: "/admin/pipeline/whitelist", key: "whitelist", label: "Whitelisted emails", table: "whitelisted_emails", ops: "create · read · update · delete" },
] as const;

export default async function PipelineHomePage() {
  await requireAdmin();
  const counts = await getPipelineCounts();

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Generation pipeline</h1>
          <p>
            Everything behind the Generate button: the prompt chains and the models they run on, what the prompts can
            draw on, every call the chains have made, and who may sign in. All of it lives in the joke board&rsquo;s own
            database, and changes take effect on the next press of Generate.
          </p>
        </div>
      </div>

      <div className="ad-tiles">
        {TABLES.map((t) => (
          <Link key={t.href} href={t.href} className="ad-tile ad-tile--link">
            <div className="ad-tile__label">{t.label}</div>
            <div className="ad-tile__value">{num(counts?.[t.key])}</div>
            <div className="ad-tile__meta">
              {"note" in t ? <>{t.note} · </> : null}<span className="ad-mono">{t.table}</span> · {t.ops}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
