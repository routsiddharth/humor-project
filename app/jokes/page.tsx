import Link from "next/link";

import { JokeCard } from "@/components/joke-card";
import { JokeFilters } from "@/components/joke-filters";
import { Masonry } from "@/components/masonry";
import { getViewer } from "@/lib/auth";
import { parseCategory } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";
import type { JokeForViewer, JokeWithAuthor } from "@/lib/types";

export const metadata = { title: "Rate jokes · humor-project" };

// Reads cookies (for the auth session), so this renders per-request rather
// than being frozen at build time.
export const dynamic = "force-dynamic";

export default async function JokesPage({ searchParams }: PageProps<"/jokes">) {
  // Public: signed-out visitors get the same list, read-only. A signed-in user
  // who never finished onboarding is still sent to finish it.
  const viewer = await getViewer("/jokes");

  const params = await searchParams;
  const justSubmitted = params.submitted === "1";

  const supabase = await createClient();

  // Every joke's category, unfiltered — the vocabulary the filter bar offers
  // and the numbers on its pills. One column across a small table, so it is
  // cheaper than running a count query per pill.
  const { data: facets } = await supabase
    .from("jokes")
    .select("category")
    .returns<{ category: string }[]>();

  const counts = new Map<string, number>();
  for (const row of facets ?? []) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  const categories = [...counts.keys()].sort();

  // Validated against what exists rather than trusted, so a hand-edited URL
  // degrades to the unfiltered view.
  const category = parseCategory(params.category, categories);

  // Runs under RLS as whoever is looking. Since 0011 the select policy covers
  // `anon` too, so this works signed out.
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
  if (category) query = query.eq("category", category);

  // rating_avg is NULL for unrated posts, so they sort last rather than first.
  const { data: jokes, error } = await query
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .order("rating_count", { ascending: false })
    .order("id", { ascending: true })
    .returns<JokeWithAuthor[]>();

  // Only ever the viewer's own votes. Nobody else's rating reaches the browser.
  const myRatings = new Map<number, number>();
  if (viewer) {
    const { data: voteRows } = await supabase
      .from("ratings")
      .select("joke_id, rating")
      .eq("user_id", viewer.user.id)
      .returns<{ joke_id: number; rating: number }[]>();
    for (const row of voteRows ?? []) myRatings.set(row.joke_id, row.rating);
  }

  const cards: JokeForViewer[] = (jokes ?? []).map((joke) => ({
    ...joke,
    myRating: myRatings.get(joke.id) ?? null,
  }));

  const filtered = category !== null;
  const count = `${cards.length} ${cards.length === 1 ? "joke" : "jokes"}`;

  return (
    <main className="page">
      <header className="page__head">
        <h1 className="page__title">Rate jokes</h1>
        <p className="page__sub">
          {error
            ? "Could not reach the database."
            : `${count}. Tap one to reveal the punchline, then give it one to five stars. Best-rated first.`}
        </p>
      </header>

      {justSubmitted ? (
        <div className="notice notice--ok" role="status">
          <strong>Posted.</strong> Yours is in the list below.
        </div>
      ) : null}

      {error ? null : (
        <JokeFilters
          categories={categories.map((name) => ({ name, count: counts.get(name) ?? 0 }))}
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
              Nothing in that category.{" "}
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
        <Masonry>
          {cards.map((joke) => (
            <li key={joke.id}>
              <JokeCard joke={joke} signedIn={viewer !== null} />
            </li>
          ))}
        </Masonry>
      )}

      <footer className="page__foot">
        Next.js App Router · Supabase Postgres · deployed on Vercel
      </footer>
    </main>
  );
}
