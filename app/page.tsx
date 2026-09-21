import { createClient } from "@/lib/supabase/server";
import { JokeCard } from "@/components/joke-card";
import type { Joke } from "@/lib/types";

// Reads cookies (for the auth session), so this renders per-request rather
// than being frozen at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();

  // Runs with the publishable key under RLS — the same access a browser has.
  const { data: jokes, error } = await supabase
    .from("jokes")
    .select("*")
    .order("rating", { ascending: false })
    .order("id", { ascending: true })
    .returns<Joke[]>();

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
