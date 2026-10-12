import Link from "next/link";

import { requireCompleteProfile } from "@/lib/auth";
import { avatarUrl, displayName, initials } from "@/lib/avatar";
import {
  BOARDS,
  formatRecord,
  formatScore,
  HUMAN_MIN_JOKES,
  HUMAN_MIN_MATCHES,
  HUMAN_MIN_VOTERS,
  JOKE_MIN_MATCHES,
  parseBoard,
  winRate,
  type Board,
} from "@/lib/showdown";
import { createClient } from "@/lib/supabase/server";
import type { ShowdownHumanRow, ShowdownJokeRow } from "@/lib/types";

export const metadata = { title: "Showdown leaderboard · humor-project" };

export const dynamic = "force-dynamic";

const LIMIT = 50;

// The embedded joke and its author. !jokes_author_id_fkey for the reason
// app/jokes/page.tsx gives: `ratings` is a second path from jokes to profiles.
const JOKE_COLUMNS =
  "*, joke:jokes(id, setup, punchline, category, source, model, author:profiles!jokes_author_id_fkey(first_name, last_name, avatar_path))";

export default async function LeaderboardPage({
  searchParams,
}: PageProps<"/showdown/leaderboard">) {
  await requireCompleteProfile("/showdown/leaderboard");

  const board = parseBoard((await searchParams).board);

  return (
    <main className="page">
      <header className="page__head showdown__head">
        <div>
          <h1 className="page__title">Leaderboard</h1>
          <p className="page__sub">
            Ranked by an adjusted score: the lowest win rate a record still
            plausibly supports. A joke at 3–0 has not proved much yet, so it
            sits below one at 60–20 until it has.
          </p>
        </div>
        <Link href="/showdown" className="btn btn--primary btn--sm">
          Play Showdown
        </Link>
      </header>

      <nav className="filters" aria-label="Choose a leaderboard">
        <ul className="filters__list">
          {BOARDS.map((option) => (
            <li key={option.value}>
              <Link
                href={option.value === "jokes" ? "/showdown/leaderboard" : `/showdown/leaderboard?board=${option.value}`}
                className={`pill${board === option.value ? " pill--on" : ""}`}
                aria-current={board === option.value ? "page" : undefined}
              >
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {board === "jokes" ? <JokeBoard /> : <HumanBoard board={board} />}
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
      .order("score", { ascending: false })
      .order("completed", { ascending: false })
      .limit(LIMIT)
      .returns<ShowdownJokeRow[]>(),
    supabase
      .from("showdown_joke_stats")
      .select(JOKE_COLUMNS)
      .gt("completed", 0)
      .lt("completed", JOKE_MIN_MATCHES)
      .order("score", { ascending: false })
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
        <Stat label="Score" value={formatScore(row.score)} strong />
        <Stat label="Record" value={formatRecord(row.wins, row.losses)} />
        <Stat label="Win rate" value={winRate(row.wins, row.losses)} />
        <Stat label="vs human" value={formatRecord(row.wins_vs_human, row.losses_vs_human)} />
        <Stat label="vs AI" value={formatRecord(row.wins_vs_ai, row.losses_vs_ai)} />
      </dl>
    </li>
  );
}

async function HumanBoard({ board }: { board: Exclude<Board, "jokes"> }) {
  const supabase = await createClient();
  const vsAi = board === "slayers";

  const { data, error } = await supabase
    .rpc("showdown_human_leaderboard", {
      p_vs_ai: vsAi,
      p_min_jokes: HUMAN_MIN_JOKES,
      p_min_matches: HUMAN_MIN_MATCHES,
      p_min_voters: HUMAN_MIN_VOTERS,
      p_limit: LIMIT,
    });

  if (error) {
    return (
      <div className="notice notice--error">
        <strong>Query failed:</strong> {error.message}
      </div>
    );
  }

  // rpc() is untyped here: the project has no generated database types.
  const rows = (data ?? []) as ShowdownHumanRow[];
  const qualified = rows.filter((row) => row.qualified);
  const provisional = rows.filter((row) => !row.qualified);

  const explainer = vsAi
    ? "Human writers ranked only on their matchups against AI-written jokes."
    : "Human writers ranked on every matchup their jokes have played.";
  const rule = `To qualify: ${HUMAN_MIN_JOKES}+ jokes of your own, ${HUMAN_MIN_MATCHES}+ ${
    vsAi ? "matchups against AI" : "matchups"
  }, and votes from ${HUMAN_MIN_VOTERS}+ different people. AI-generated jokes never count toward the person who prompted them.`;

  return (
    <>
      <p className="board__intro">
        {explainer} {rule}
      </p>

      {!rows.length ? (
        <div className="notice">
          No human-written jokes have been voted on {vsAi ? "against AI " : ""}yet.{" "}
          <Link href="/submit" className="notice__link">
            Write one
          </Link>
          .
        </div>
      ) : (
        <>
          <section className="board">
            <h2 className="board__title">{vsAi ? "AI slayers" : "Top humans"}</h2>
            {qualified.length ? (
              <ol className="board__list">
                {qualified.map((row, index) => (
                  <HumanEntry key={row.author_id} row={row} rank={index + 1} />
                ))}
              </ol>
            ) : (
              <p className="board__empty">Nobody has qualified yet — see Rising below.</p>
            )}
          </section>

          {provisional.length ? (
            <section className="board">
              <h2 className="board__title">
                Rising <span className="board__aside">provisional · not yet qualified</span>
              </h2>
              <ol className="board__list board__list--provisional">
                {provisional.map((row) => (
                  <HumanEntry key={row.author_id} row={row} rank={null} />
                ))}
              </ol>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}

function HumanEntry({ row, rank }: { row: ShowdownHumanRow; rank: number | null }) {
  const name = displayName(row.first_name, row.last_name) ?? "Someone";
  const photo = avatarUrl(row.avatar_path);

  return (
    <li className="entry entry--person">
      <span className="entry__rank">{rank ?? "·"}</span>

      <div className="entry__main entry__person">
        <span className="avatar" aria-hidden="true">
          {photo ? <img src={photo} alt="" /> : initials(row.first_name, row.last_name)}
        </span>
        <span className="entry__name">{name}</span>
      </div>

      <dl className="entry__stats">
        <Stat label="Score" value={formatScore(row.score)} strong />
        <Stat label="Record" value={formatRecord(row.wins, row.losses)} />
        <Stat label="Win rate" value={winRate(row.wins, row.losses)} />
        <Stat label="Jokes" value={String(row.jokes)} />
        <Stat label="Voters" value={String(row.voters)} />
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
