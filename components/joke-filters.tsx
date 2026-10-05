import Link from "next/link";

import { jokesHref, KINDS } from "@/lib/memes";
import type { JokeKind } from "@/lib/types";

// Every (kind, category) pair in the table. Cheap to select and enough to count
// every facet without a query per pill.
export type FacetRow = { kind: JokeKind; category: string };

// Server Component: the filters are plain links, so switching one is a
// navigation rather than client state. That keeps the active filter in the URL,
// which makes it shareable and survives a reload.
export function JokeFilters({
  rows,
  categories,
  kind,
  category,
}: {
  rows: FacetRow[];
  categories: string[];
  kind: JokeKind | null;
  category: string | null;
}) {
  // Each row counts within the *other* row's filter, so a number reads as "how
  // many you get if you click this" rather than as a total that disagrees with
  // the list underneath it.
  const countKind = (value: JokeKind | null) =>
    rows.filter(
      (row) =>
        (value === null || row.kind === value) &&
        (category === null || row.category === category),
    ).length;

  const countCategory = (value: string | null) =>
    rows.filter(
      (row) =>
        (value === null || row.category === value) &&
        (kind === null || row.kind === kind),
    ).length;

  return (
    <nav className="filters" aria-label="Filter the list">
      <div className="filters__row">
        <span className="filters__legend">Type</span>
        <ul className="filters__list">
          <FilterPill
            href={jokesHref({ kind: null, category })}
            label="Everything"
            count={countKind(null)}
            active={kind === null}
          />
          {KINDS.map((option) => (
            <FilterPill
              key={option.value}
              href={jokesHref({ kind: option.value, category })}
              label={option.label}
              count={countKind(option.value)}
              active={kind === option.value}
            />
          ))}
        </ul>
      </div>

      {/* With one category there is nothing to choose between. */}
      {categories.length > 1 ? (
        <div className="filters__row">
          <span className="filters__legend">Category</span>
          <ul className="filters__list">
            <FilterPill
              href={jokesHref({ kind, category: null })}
              label="All"
              count={countCategory(null)}
              active={category === null}
            />
            {categories.map((name) => (
              <FilterPill
                key={name}
                href={jokesHref({ kind, category: name })}
                label={name}
                count={countCategory(name)}
                active={category === name}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

function FilterPill({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`pill${active ? " pill--on" : ""}`}
        // aria-current is what tells a screen reader which of these links is
        // the view you are already looking at.
        aria-current={active ? "page" : undefined}
      >
        {label}
        <span className="pill__count">{count}</span>
      </Link>
    </li>
  );
}
