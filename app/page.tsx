import { JokeCard } from "@/components/joke-card";
import { createClient } from "@/lib/supabase/server";
import type { JokeForViewer, JokeWithAuthor } from "@/lib/types";

// Reads cookies (for the auth session), so this renders per-request rather
// than being frozen at build time.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const justSubmitted = params.submitted === "1";

  const supabase = await createClient();

  // Runs with the publishable key under RLS — the same access a browser has.
  // The embedded author resolves through the jokes.author_id → profiles.id
  // foreign key, so it costs one round trip rather than one per joke.
  //
  // !jokes_author_id_fkey names that constraint explicitly, and is required
  // rather than decorative: `ratings` links jokes to profiles a second way, so
  // a bare `profiles(...)` is ambiguous and PostgREST refuses the whole query
  // with "more than one relationship was found".
  //
  // rating_avg is NULL for unrated jokes, so they sort last rather than first.
  const { data: jokes, error } = await supabase
    .from("jokes")
    .select("*, author:profiles!jokes_author_id_fkey(first_name, last_name, avatar_path)")
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .order("rating_count", { ascending: false })
    .order("id", { ascending: true })
    .returns<JokeWithAuthor[]>();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only ever the viewer's own votes. Nobody else's rating reaches the browser.
  const myRatings = new Map<number, number>();
  if (user) {
    const { data: rows } = await supabase
      .from("ratings")
      .select("joke_id, rating")
      .eq("user_id", user.id)
      .returns<{ joke_id: number; rating: number }[]>();
    for (const row of rows ?? []) myRatings.set(row.joke_id, row.rating);
  }

  const cards: JokeForViewer[] = (jokes ?? []).map((joke) => ({
    ...joke,
    myRating: myRatings.get(joke.id) ?? null,
  }));

  return (
    <main className="page">
      <header className="page__head">
        <h1 className="page__title">humor-project</h1>
        <p className="page__sub">
          {error
            ? "Could not reach the database."
            : `${cards.length} jokes, served from Supabase. Punchlines hidden — tap to reveal.`}
        </p>
      </header>

      {justSubmitted ? (
        <div className="notice notice--ok" role="status">
          <strong>Posted.</strong> Your joke is in the list below.
        </div>
      ) : null}

      {error ? (
        <div className="notice notice--error">
          <strong>Query failed:</strong> {error.message}
        </div>
      ) : !cards.length ? (
        <div className="notice">
          No rows returned. If the table has data, the row-level security policy
          is not letting the anon role read it.
        </div>
      ) : (
        <ul className="grid">
          {cards.map((joke) => (
            <li key={joke.id}>
              <JokeCard joke={joke} signedIn={Boolean(user)} />
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
