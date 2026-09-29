import { JokeCard } from "@/components/joke-card";
import { createClient } from "@/lib/supabase/server";
import type { JokeWithAuthor } from "@/lib/types";

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
  const { data: jokes, error } = await supabase
    .from("jokes")
    .select("*, author:profiles(first_name, last_name, avatar_path)")
    .order("rating", { ascending: false })
    .order("id", { ascending: true })
    .returns<JokeWithAuthor[]>();

  return (
    <main className="page">
      <header className="page__head">
        <h1 className="page__title">humor-project</h1>
        <p className="page__sub">
          {error
            ? "Could not reach the database."
            : `${jokes?.length ?? 0} jokes, served from Supabase. Punchlines hidden — tap to reveal.`}
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
      ) : !jokes?.length ? (
        <div className="notice">
          No rows returned. If the table has data, the row-level security policy
          is not letting the anon role read it.
        </div>
      ) : (
        <ul className="grid">
          {jokes.map((joke) => (
            <li key={joke.id}>
              <JokeCard joke={joke} />
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
