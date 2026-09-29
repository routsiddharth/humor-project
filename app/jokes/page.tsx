import { JokeCard } from "@/components/joke-card";
import { requireCompleteProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { JokeForViewer, JokeWithAuthor } from "@/lib/types";

export const metadata = { title: "Jokes · humor-project" };

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

  // Runs as the signed-in user under RLS. Since 0004 the select policy is
  // `to authenticated`, so this query returns nothing without a session —
  // the login gate is enforced by the database, not just by the page.
  //
  // !jokes_author_id_fkey names the constraint explicitly, and is required
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

  // Only ever the viewer's own votes. Nobody else's rating reaches the browser.
  const myRatings = new Map<number, number>();
  const { data: rows } = await supabase
    .from("ratings")
    .select("joke_id, rating")
    .eq("user_id", user.id)
    .returns<{ joke_id: number; rating: number }[]>();
  for (const row of rows ?? []) myRatings.set(row.joke_id, row.rating);

  const cards: JokeForViewer[] = (jokes ?? []).map((joke) => ({
    ...joke,
    myRating: myRatings.get(joke.id) ?? null,
  }));

  return (
    <main className="page">
      <header className="page__head">
        <h1 className="page__title">Jokes</h1>
        <p className="page__sub">
          {error
            ? "Could not reach the database."
            : `${cards.length} of them. Punchlines hidden — tap to reveal, then rate.`}
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
          is not letting this session read it.
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
