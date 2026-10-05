import Link from "next/link";

import { JokeCard } from "@/components/joke-card";
import { JokeFilters, type FacetRow } from "@/components/joke-filters";
import { requireCompleteProfile } from "@/lib/auth";
import { parseCategory, parseKind } from "@/lib/memes";
import { createClient } from "@/lib/supabase/server";
import type { JokeForViewer, JokeWithAuthor } from "@/lib/types";

export const metadata = { title: "Jokes & memes · humor-project" };

// Reads cookies (for the auth session), so this renders per-request rather
// than being frozen at build time.
export const dynamic = "force-dynamic";

export default async function JokesPage({ searchParams }: PageProps<"/jokes">) {
  // The gate. proxy.ts bounces anonymous visitors before they get here; this is
  // the authoritative check, and it also catches a signed-in user who never
  // finished onboarding.
  const { user } = await requireCompleteProfile("/jokes");

  const params = await searchParams;
  const justSubmitted = params.submitted === "1";

  const supabase = await createClient();

  // Every (kind, category) pair, unfiltered — the vocabulary the filter bar
  // offers and the numbers on its pills. Two columns across a small table, so
  // it is cheaper than running a count query per pill.
  const { data: facets } = await supabase
    .from("jokes")
    .select("kind, category")
    .returns<FacetRow[]>();

  const rows = facets ?? [];
  const categories = [...new Set(rows.map((row) => row.category))].sort();

  // Both filters are validated against what exists rather than trusted, so a
  // hand-edited URL degrades to the unfiltered view.
  const kind = parseKind(params.kind);
  const category = parseCategory(params.category, categories);

  // Runs as the signed-in user under RLS. Since 0004 the select policy is
  // `to authenticated`, so this query returns nothing without a session —
  // the login gate is enforced by the database, not just by the page.
  //
  // !jokes_author_id_fkey names the constraint explicitly, and is required
  // rather than decorative: `ratings` links jokes to profiles a second way, so
  // a bare `profiles(...)` is ambiguous and PostgREST refuses the whole query
  // with "more than one relationship was found".
  let query = supabase
    .from("jokes")
    .select("*, author:profiles!jokes_author_id_fkey(first_name, last_name, avatar_path)");

  // Filtering in the query rather than in JS, so the page does not grow a
  // habit of reading the whole table to show a tenth of it.
  if (kind) query = query.eq("kind", kind);
  if (category) query = query.eq("category", category);

  // rating_avg is NULL for unrated posts, so they sort last rather than first.
  const { data: jokes, error } = await query
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .order("rating_count", { ascending: false })
    .order("id", { ascending: true })
    .returns<JokeWithAuthor[]>();

  // Only ever the viewer's own votes. Nobody else's rating reaches the browser.
  const myRatings = new Map<number, number>();
  const { data: voteRows } = await supabase
    .from("ratings")
    .select("joke_id, rating")
    .eq("user_id", user.id)
    .returns<{ joke_id: number; rating: number }[]>();
  for (const row of voteRows ?? []) myRatings.set(row.joke_id, row.rating);

  const cards: JokeForViewer[] = (jokes ?? []).map((joke) => ({
    ...joke,
    myRating: myRatings.get(joke.id) ?? null,
  }));

  const filtered = kind !== null || category !== null;
  const count = `${cards.length} ${cards.length === 1 ? "post" : "posts"}`;

  return (
    <main className="page">
      <header className="page__head">
        <h1 className="page__title">Jokes &amp; memes</h1>
        <p className="page__sub">
          {error
            ? "Could not reach the database."
            : `${count}. Jokes keep their punchline until you tap; memes just sit there.`}
        </p>
      </header>

      {justSubmitted ? (
        <div className="notice notice--ok" role="status">
          <strong>Posted.</strong> Yours is in the list below.
        </div>
      ) : null}

      {error ? null : (
        <JokeFilters
          rows={rows}
          categories={categories}
          kind={kind}
          category={category}
        />
      )}

      {error ? (
        <div className="notice notice--error">
          <strong>Query failed:</strong> {error.message}
        </div>
      ) : !cards.length ? (
        <div className="notice">
          {filtered ? (
            <>
              Nothing matches those filters.{" "}
              <Link href="/jokes" className="notice__link">
                Show everything
              </Link>
              .
            </>
          ) : (
            "No rows returned. If the table has data, the row-level security policy is not letting this session read it."
          )}
        </div>
      ) : (
        <ul className="grid">
          {cards.map((joke) => (
            <li key={joke.id}>
              <JokeCard joke={joke} signedIn />
            </li>
          ))}
        </ul>
      )}

      <footer className="page__foot">
        Next.js App Router · Supabase Postgres · deployed on Vercel
      </footer>
    </main>
  );
}
