import Link from "next/link";

import { jokesHref } from "@/lib/filters";

// Server Component: the filters are plain links, so switching one is a
// navigation rather than client state. That keeps the active filter in the URL,
// which makes it shareable and survives a reload.
export function JokeFilters({
  categories,
  category,
}: {
  // Every category in the table with how many jokes it has, so the pills can
  // show counts without a query per pill.
  categories: { name: string; count: number }[];
  category: string | null;
}) {
  // With one category there is nothing to choose between.
  if (categories.length < 2) return null;

  const total = categories.reduce((sum, row) => sum + row.count, 0);

  return (
    <nav className="filters" aria-label="Filter the list">
      <div className="filters__row">
        <span className="filters__legend">Category</span>
        <ul className="filters__list">
          <FilterPill
            href={jokesHref(null)}
            label="All"
            count={total}
            active={category === null}
          />
          {categories.map((row) => (
            <FilterPill
              key={row.name}
              href={jokesHref(row.name)}
              label={row.name}
              count={row.count}
              active={category === row.name}
            />
          ))}
        </ul>
      </div>
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
