import Link from "next/link";

import { requireAdmin } from "@/lib/admin/dal";
import { num } from "@/lib/admin/format";
import { getStudyCounts } from "@/lib/admin/study/read";

export const metadata = { title: "Study database · Humor Admin" };

const TABLES = [
  { slug: "users", key: "users", label: "Users", table: "profiles", ops: "read" },
  { slug: "chains", key: "chains", label: "Prompt chains", table: "humor_flavors", ops: "read" },
  { slug: "steps", key: "steps", label: "Prompt chain steps", table: "humor_flavor_steps", ops: "read" },
  { slug: "mix", key: "mix", label: "Prompt chain mix", table: "humor_flavor_mix", ops: "read · update" },
  { slug: "terms", key: "terms", label: "Terms", table: "terms", ops: "create · read · update · delete" },
  { slug: "media", key: "captions", label: "AI media", table: "captions + images", ops: "read" },
  { slug: "requests", key: "requests", label: "Generation requests", table: "caption_requests", ops: "read" },
  { slug: "examples", key: "examples", label: "Generation examples", table: "caption_examples", ops: "create · read · update · delete" },
  { slug: "models", key: "models", label: "LLM models", table: "llm_models", ops: "create · read · update · delete" },
  { slug: "providers", key: "providers", label: "LLM providers", table: "llm_providers", ops: "create · read · update · delete" },
  { slug: "responses", key: "responses", label: "LLM responses", table: "llm_model_responses", ops: "read" },
  { slug: "domains", key: "domains", label: "Allowed signup domains", table: "allowed_signup_domains", ops: "create · read · update · delete" },
  { slug: "whitelist", key: "whitelist", label: "Whitelisted emails", table: "whitelist_email_addresses", ops: "create · read · update · delete" },
] as const;

export default async function StudyHomePage() {
  await requireAdmin();
  const counts = await getStudyCounts();

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Study database</h1>
          <p>
            The shared humor-study data behind the caption pipeline — who can sign up, the prompt chains and
            models that write captions, and everything they have produced. Changes here write straight to that database.
          </p>
        </div>
      </div>

      <div className="ad-tiles">
        {TABLES.map((t) => (
          <Link key={t.slug} href={`/admin/study/${t.slug}`} className="ad-tile ad-tile--link">
            <div className="ad-tile__label">{t.label}</div>
            <div className="ad-tile__value">{num(counts?.[t.key])}</div>
            <div className="ad-tile__meta"><span className="ad-mono">{t.table}</span> · {t.ops}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
