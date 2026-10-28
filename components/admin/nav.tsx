"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = {
  overview: "M3 13h4v8H3zM10 3h4v18h-4zM17 8h4v13h-4z",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  media: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
  pipeline: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  votes: "M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3l4-8a3 3 0 0 1 4 3.9z",
};

const LINKS = [
  { href: "/admin", label: "Overview", icon: ICONS.overview, note: null },
  { href: "/admin/users", label: "Users", icon: ICONS.users, note: "read" },
  { href: "/admin/media", label: "AI media", icon: ICONS.media, note: "edit" },
  { href: "/admin/votes", label: "Votes", icon: ICONS.votes, note: "read" },
  { href: "/admin/pipeline", label: "Pipeline", icon: ICONS.pipeline, note: "edit" },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="ad-subnav" aria-label="Admin">
      <span className="ad-subnav__label">Admin</span>
      {LINKS.map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className="ad-subnav__link" aria-current={active ? "page" : undefined}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={link.icon} />
            </svg>
            {link.label}
            {link.note ? <span className="ad-subnav__note">{link.note}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
