"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The pipeline's sections, grouped the way a press of Generate runs: who may
// sign in, how prompts are built, which models answer, and what came out.
// Users and AI media live in their own admin tabs and are linked from there.
const GROUPS = [
  { label: "People", links: [["/admin/users", "Users"], ["/admin/pipeline/domains", "Signup domains"], ["/admin/pipeline/whitelist", "Whitelisted emails"]] },
  { label: "Prompting", links: [["/admin/pipeline/chains", "Prompt chains"], ["/admin/pipeline/steps", "Steps"], ["/admin/pipeline/mix", "Mix"], ["/admin/pipeline/terms", "Terms"], ["/admin/pipeline/examples", "Examples"]] },
  { label: "Models", links: [["/admin/pipeline/models", "Models"], ["/admin/pipeline/providers", "Providers"]] },
  { label: "Output", links: [["/admin/media", "AI media"], ["/admin/pipeline/requests", "Requests"], ["/admin/pipeline/responses", "LLM responses"]] },
] as const;

export function PipelineNav() {
  const pathname = usePathname();
  return (
    <nav className="ad-secnav" aria-label="Pipeline">
      <Link href="/admin/pipeline" className="ad-secnav__home" aria-current={pathname === "/admin/pipeline" ? "page" : undefined}>All tables</Link>
      {GROUPS.map((g) => (
        <div key={g.label} className="ad-secnav__group">
          <span className="ad-secnav__label">{g.label}</span>
          {g.links.map(([href, label]) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined}>{label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
