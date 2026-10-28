"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The study database's sections, grouped the way the pipeline runs: who may
// sign in, how prompts are built, which models answer, and what came out.
const GROUPS = [
  { label: "People", links: [["users", "Users"], ["domains", "Signup domains"], ["whitelist", "Whitelisted emails"]] },
  { label: "Prompting", links: [["chains", "Prompt chains"], ["steps", "Steps"], ["mix", "Mix"], ["terms", "Terms"], ["examples", "Examples"]] },
  { label: "Models", links: [["models", "Models"], ["providers", "Providers"]] },
  { label: "Output", links: [["media", "AI media"], ["requests", "Requests"], ["responses", "LLM responses"]] },
] as const;

export function StudyNav() {
  const pathname = usePathname();
  return (
    <nav className="ad-studynav" aria-label="Study database">
      <Link href="/admin/study" className="ad-studynav__home" aria-current={pathname === "/admin/study" ? "page" : undefined}>All tables</Link>
      {GROUPS.map((g) => (
        <div key={g.label} className="ad-studynav__group">
          <span className="ad-studynav__label">{g.label}</span>
          {g.links.map(([slug, label]) => {
            const href = `/admin/study/${slug}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={slug} href={href} aria-current={active ? "page" : undefined}>{label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
