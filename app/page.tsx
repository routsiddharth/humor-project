import Link from "next/link";

import { AverageStars } from "@/components/stars";
import { getViewer } from "@/lib/auth";
import { formatRating, formatRecord, JOKE_MIN_MATCHES } from "@/lib/showdown";
import { createClient } from "@/lib/supabase/server";
import type { Joke, ShowdownJokeStats } from "@/lib/types";

export const metadata = {
  title: "humor-project · rate jokes, then make them fight",
};

// Live numbers and the current top of the leaderboard, so it renders per
// request like the pages it points at.
export const dynamic = "force-dynamic";

type PreviewJoke = Pick<
  Joke,
  "id" | "kind" | "setup" | "punchline" | "category" | "source" | "model" | "rating_avg" | "rating_count"
>;

type BoardRow = Pick<ShowdownJokeStats, "joke_id" | "wins" | "losses" | "completed" | "rating"> & {
  joke: Pick<Joke, "setup" | "punchline" | "source" | "model"> | null;
};

// The front door. Before this, `/` went straight to the joke list and nobody
// could tell what the site was for. It says it in one line, then shows the two
// things to do here — rating and Showdown — using real posts rather than
// mock-ups, and only then the side features.
export default async function Landing() {
  // Public, like /jokes. Signed-in users who never finished onboarding are
  // still sent to finish it.
  const viewer = await getViewer("/");
  const supabase = await createClient();

  const [posts, board] = await Promise.all([
    supabase
      .from("jokes")
      .select("id, kind, setup, punchline, category, source, model, rating_avg, rating_count")
      .order("rating_avg", { ascending: false, nullsFirst: false })
      .order("rating_count", { ascending: false })
      .order("id", { ascending: true })
      .returns<PreviewJoke[]>(),
    // Every row, not a top 3: the vote total is a sum over all of them. The
    // table has one row per joke that has ever been in a match, so it is small.
    supabase
      .from("showdown_joke_stats")
      .select("joke_id, wins, losses, completed, rating, joke:jokes(setup, punchline, source, model)")
      .gt("completed", 0)
      .order("rating", { ascending: false })
      .order("completed", { ascending: false })
      .returns<BoardRow[]>(),
  ]);

  const jokes = posts.data ?? [];
  const rows = board.data ?? [];

  // Written jokes only for the previews: a meme needs its image, and the
  // Showdown never shows memes.
  const text = jokes.filter((joke) => joke.kind === "text" && joke.setup && joke.punchline);
  const rateExample = text[0] ?? null;
  const rest = text.filter((joke) => joke.id !== rateExample?.id);
  // One human and one AI joke if there are both, because that is the question
  // Showdown asks. Their badges stay hidden here, same as in a real round.
  const human = rest.find((joke) => joke.source === "human");
  const ai = rest.find((joke) => joke.source === "ai");
  const duel = human && ai ? [human, ai] : rest.slice(0, 2);

  const ratings = jokes.reduce((sum, joke) => sum + joke.rating_count, 0);
  // Each completed match is counted once per joke in it.
  const votes = Math.round(rows.reduce((sum, row) => sum + row.completed, 0) / 2);

  // Ranked jokes first, then the provisional ones, the same split the
  // leaderboard makes, so a joke with one lucky win does not top the teaser.
  const ranked = [
    ...rows.filter((row) => row.completed >= JOKE_MIN_MATCHES),
    ...rows.filter((row) => row.completed < JOKE_MIN_MATCHES),
  ]
    .filter((row) => row.joke)
    .slice(0, 3);

  return (
    <main className="page landing">
      <section className="hero">
        <h1 className="hero__title">
          Which joke is <em>actually</em> funny?
        </h1>
        <p className="hero__lede">
          A joke and meme site where everyone gets a vote. <strong>Rate</strong>{" "}
          posts from one to five stars, or play <strong>Showdown</strong>: two
          jokes, no names, you pick the funnier one, then find out whether a
          person or an AI wrote it.
        </p>
        <div className="hero__actions">
          <Link href="/jokes" className="btn btn--primary btn--lg">
            Start rating
          </Link>
          <Link href="/showdown" className="btn btn--accent btn--lg">
            Play Showdown
          </Link>
        </div>
        {jokes.length ? (
          <p className="hero__stats">
            <Stat value={jokes.length} label={jokes.length === 1 ? "post" : "posts"} />
            <Stat value={ratings} label={ratings === 1 ? "rating" : "ratings"} />
            <Stat value={votes} label={votes === 1 ? "Showdown vote" : "Showdown votes"} />
          </p>
        ) : null}
        {viewer ? null : (
          <p className="hero__note">
            Browsing is open to everyone. Rating and playing need a quick Google
            sign-in.
          </p>
        )}
      </section>

      <section className="features" aria-label="What you can do">
        <article className="feature">
          <header className="feature__head">
            <span className="feature__num" aria-hidden="true">1</span>
            <div>
              <h2 className="feature__title">Rate jokes &amp; memes</h2>
              <p className="feature__text">
                Read the setup, tap to reveal the punchline, give it one to five
                stars. The best-rated posts rise to the top of the list.
              </p>
            </div>
          </header>

          {rateExample ? (
            <div className="preview" aria-hidden="true">
              <div className="preview-card">
                <div className="card__head">
                  <span className="card__chips">
                    <span className="chip">{rateExample.category}</span>
                    {rateExample.source === "ai" ? (
                      <span className="chip chip--ai">AI · {rateExample.model}</span>
                    ) : null}
                  </span>
                  <AverageStars average={rateExample.rating_avg} count={rateExample.rating_count} />
                </div>
                <p className="card__setup">{rateExample.setup}</p>
                <p className="card__punchline">{rateExample.punchline}</p>
                <div className="preview-card__rate">
                  <span>Your rating</span>
                  <span className="preview-card__stars">★★★★<span>★</span></span>
                </div>
              </div>
            </div>
          ) : null}

          <Link href="/jokes" className="feature__cta">
            Browse and rate <span aria-hidden="true">→</span>
          </Link>
        </article>

        <article className="feature feature--showdown">
          <header className="feature__head">
            <span className="feature__num" aria-hidden="true">2</span>
            <div>
              <h2 className="feature__title">Showdown</h2>
              <p className="feature__text">
                Two jokes side by side, authors hidden. Pick the funnier one and
                the badges flip over: human or AI? Every vote moves the jokes up
                or down an Elo leaderboard.
              </p>
            </div>
          </header>

          {duel.length === 2 ? (
            <div className="preview preview--duel" aria-hidden="true">
              {duel.map((joke, index) => (
                <div key={joke.id} className="preview-duel">
                  <div className="duel__top">
                    <span className="duel__label">{index === 0 ? "A" : "B"}</span>
                    <span className="preview-duel__mystery">Human or AI?</span>
                  </div>
                  <p className="preview-duel__setup">{joke.setup}</p>
                  <p className="preview-duel__punchline">{joke.punchline}</p>
                </div>
              ))}
              <span className="preview--duel__vs">vs</span>
            </div>
          ) : null}

          <div className="feature__ctas">
            <Link href="/showdown" className="feature__cta">
              Play a round <span aria-hidden="true">→</span>
            </Link>
            <Link href="/showdown/leaderboard" className="feature__cta feature__cta--quiet">
              Leaderboard
            </Link>
          </div>
        </article>
      </section>

      {ranked.length ? (
        <section className="teaser">
          <div className="teaser__head">
            <h2 className="teaser__title">Winning Showdown right now</h2>
            <Link href="/showdown/leaderboard" className="teaser__link">
              Full leaderboard <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ol className="teaser__list">
            {ranked.map((row, index) => (
              <li key={row.joke_id} className="teaser__row">
                <span className="teaser__rank">{index + 1}</span>
                <div className="teaser__joke">
                  <p className="teaser__setup">{row.joke!.setup}</p>
                  <p className="teaser__punchline">{row.joke!.punchline}</p>
                </div>
                <div className="teaser__meta">
                  {row.joke!.source === "ai" ? (
                    <span className="chip chip--ai">AI</span>
                  ) : (
                    <span className="chip chip--human">Human</span>
                  )}
                  <span className="teaser__record">
                    {formatRecord(row.wins, row.losses)} · Elo {formatRating(row.rating)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="extras" aria-label="More">
        <p className="extras__text">
          Got one of your own?{" "}
          <Link href="/submit" className="notice__link">
            Post a joke or meme
          </Link>
          , or{" "}
          <Link href="/generate" className="notice__link">
            have an AI write one
          </Link>{" "}
          and let it fight in Showdown.
        </p>
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="hero__stat">
      <strong>{value.toLocaleString("en-US")}</strong> {label}
    </span>
  );
}
