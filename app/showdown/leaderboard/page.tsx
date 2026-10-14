import Link from "next/link";

import { getViewer } from "@/lib/auth";
import { displayName } from "@/lib/avatar";
import { formatRecord, formatRating, JOKE_MIN_MATCHES, winRate } from "@/lib/showdown";
import { createClient } from "@/lib/supabase/server";
import type { ShowdownJokeRow } from "@/lib/types";

export const metadata = { title: "Showdown leaderboard · humor-project" };

export const dynamic = "force-dynamic";

const LIMIT = 50;

// The embedded joke and its author. !jokes_author_id_fkey for the reason
// app/jokes/page.tsx gives: `ratings` is a second path from jokes to profiles.
const JOKE_COLUMNS =
  "*, joke:jokes(id, setup, punchline, category, source, model, author:profiles!jokes_author_id_fkey(first_name, last_name, avatar_path))";

export default async function LeaderboardPage() {
  // Public. Playing is not: /showdown sends signed-out visitors to sign in.
  await getViewer("/showdown/leaderboard");

  return (
    <main className="page">
      <header className="page__head showdown__head">
        <div>
          <h1 className="page__title">Leaderboard</h1>
          <p className="page__sub">
            Ranked by Elo rating. Every joke starts at 1000; each vote moves
            points from the loser to the winner, and beating a higher-rated
            joke is worth more than beating a lower-rated one.
          </p>
        </div>
        <Link href="/showdown" className="btn btn--primary btn--sm">
          Play Showdown
        </Link>
      </header>

      <JokeBoard />
    </main>
  );
}

async function JokeBoard() {
  const supabase = await createClient();

  const [ranked, rising] = await Promise.all([
    supabase
      .from("showdown_joke_stats")
      .select(JOKE_COLUMNS)
      .gte("completed", JOKE_MIN_MATCHES)
      .order("rating", { ascending: false })
      .order("completed", { ascending: false })
      .limit(LIMIT)
      .returns<ShowdownJokeRow[]>(),
    supabase
      .from("showdown_joke_stats")
      .select(JOKE_COLUMNS)
      .gt("completed", 0)
      .lt("completed", JOKE_MIN_MATCHES)
      .order("rating", { ascending: false })
      .order("completed", { ascending: false })
      .limit(LIMIT)
      .returns<ShowdownJokeRow[]>(),
  ]);

  const error = ranked.error ?? rising.error;
  if (error) {
    return (
      <div className="notice notice--error">
        <strong>Query failed:</strong> {error.message}
      </div>
    );
  }

  const main = ranked.data ?? [];
  const provisional = rising.data ?? [];

  if (!main.length && !provisional.length) {
    return (
      <div className="notice">
        No votes yet.{" "}
        <Link href="/showdown" className="notice__link">
          Cast the first one
        </Link>
        .
      </div>
    );
  }

  return (
    <>
      <section className="board">
        <h2 className="board__title">Best jokes</h2>
        {main.length ? (
          <ol className="board__list">
            {main.map((row, index) => (
              <JokeEntry key={row.joke_id} row={row} rank={index + 1} />
            ))}
          </ol>
        ) : (
          <p className="board__empty">
            Nothing has finished {JOKE_MIN_MATCHES} matchups yet. Until
            something has, every joke is in Rising below.
          </p>
        )}
      </section>

      {provisional.length ? (
        <section className="board">
          <h2 className="board__title">
            Rising <span className="board__aside">provisional · fewer than {JOKE_MIN_MATCHES} matchups</span>
          </h2>
          <ol className="board__list board__list--provisional">
            {provisional.map((row) => (
              <JokeEntry key={row.joke_id} row={row} rank={null} />
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function JokeEntry({ row, rank }: { row: ShowdownJokeRow; rank: number | null }) {
  const { joke } = row;
  const isAi = joke.source === "ai";
  const author = displayName(joke.author?.first_name, joke.author?.last_name);

  return (
    <li className="entry">
      <span className="entry__rank">{rank ?? "·"}</span>

      <div className="entry__main">
        <p className="entry__setup">{joke.setup}</p>
        <p className="entry__punchline">{joke.punchline}</p>
        <p className="entry__meta">
          <span className="chip">{joke.category}</span>
          {isAi ? (
            <span className="chip chip--ai">AI · {joke.model}</span>
          ) : (
            <span className="chip chip--human">Human</span>
          )}
          {/* An AI joke's author_id is whoever pressed Generate. They prompted
              it; they did not write it, so no byline. */}
          {!isAi && author ? <span className="entry__byline">by {author}</span> : null}
        </p>
      </div>

      <dl className="entry__stats">
        <Stat label="Elo" value={formatRating(row.rating)} strong />
        <Stat label="Record" value={formatRecord(row.wins, row.losses)} />
        <Stat label="Win rate" value={winRate(row.wins, row.losses)} />
        <Stat label="vs human" value={formatRecord(row.wins_vs_human, row.losses_vs_human)} />
        <Stat label="vs AI" value={formatRecord(row.wins_vs_ai, row.losses_vs_ai)} />
      </dl>
    </li>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`stat${strong ? " stat--strong" : ""}`}>
      <dt className="stat__label">{label}</dt>
      <dd className="stat__value">{value}</dd>
    </div>
  );
}
