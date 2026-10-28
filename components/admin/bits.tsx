import Link from "next/link";

import { avatarUrl, initials } from "@/lib/avatar";

export function Avatar({ first, last, path, size }: { first?: string | null; last?: string | null; path?: string | null; size?: "lg" }) {
  const url = avatarUrl(path);
  return (
    <span className={`ad-avatar${size === "lg" ? " ad-avatar--lg" : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" /> : initials(first, last)}
    </span>
  );
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value == null) return <span className="ad-muted">unrated</span>;
  const full = Math.round(value);
  return (
    <span className="ad-stars" title={`${value.toFixed(2)} stars`}>
      <span className="ad-stars__on" aria-hidden="true">{"★".repeat(full)}</span>
      <span className="ad-stars__off" aria-hidden="true">{"★".repeat(5 - full)}</span>{" "}
      {value.toFixed(1)}
      {count != null ? <span className="ad-muted"> · {count}</span> : null}
    </span>
  );
}

const SOURCE_LABEL = { human: "Human", ai: "AI" } as const;

export function SourceBadge({ source }: { source: string }) {
  const key = source === "ai" ? "ai" : "human";
  return (
    <span className="ad-badge">
      <span className={`ad-dot ad-bg-${key}`} />
      {SOURCE_LABEL[key]}
    </span>
  );
}

// Pagination that keeps the rest of the query string.
export function Pager({ page, pageSize, total, params, path }:
  { page: number; pageSize: number; total: number; params: Record<string, string>; path: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `${path}?${new URLSearchParams({ ...params, page: String(p) })}`;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="ad-pager">
      <span className="ad-num">{from}–{to} of {total}</span>
      <div className="ad-pager__links">
        {page > 1 ? <Link className="ad-btn ad-btn--sm" href={href(page - 1)}>Previous</Link> : null}
        {page < pages ? <Link className="ad-btn ad-btn--sm" href={href(page + 1)}>Next</Link> : null}
      </div>
    </div>
  );
}

export function JokeText({ setup, punchline }: { setup: string | null; punchline?: string | null }) {
  return (
    <span className="ad-joke">
      <span className="ad-joke__setup">{setup}</span>
      {punchline ? <> <span className="ad-joke__punch">{punchline}</span></> : null}
    </span>
  );
}

// Search params arrive as string | string[] | undefined.
export function param(value: string | string[] | undefined, fallback = ""): string {
  return (Array.isArray(value) ? value[0] : value) ?? fallback;
}

export function pageParam(value: string | string[] | undefined): number {
  const n = Number(param(value, "1"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}
