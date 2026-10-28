"use client";

import Link from "next/link";
import { useState } from "react";

import { AverageStars, RateControl } from "@/components/stars";
import { avatarUrl, displayName, initials } from "@/lib/avatar";
import type { JokeForViewer } from "@/lib/types";

export function JokeCard({
  joke,
  signedIn,
}: {
  joke: JokeForViewer;
  signedIn: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  const author = displayName(joke.author?.first_name, joke.author?.last_name);
  const photo = avatarUrl(joke.author?.avatar_path);

  const isAi = joke.source === "ai";

  const head = (
    <header className="card__head">
      {/* Chips are grouped so the header keeps two flex children and its
          space-between still pushes the rating to the right edge. */}
      <span className="card__chips">
        <span className="chip">{joke.category}</span>
        {/* The badge is the point of 0007: an AI post is never silently mixed
            in with the written ones. `model` is NOT NULL whenever source is
            'ai' (jokes_provenance_check), so there is always a name to show. */}
        {isAi ? <span className="chip chip--ai">AI · {joke.model}</span> : null}
      </span>
      {/* Renders nothing while the post is unrated. */}
      <AverageStars average={joke.rating_avg} count={joke.rating_count} />
    </header>
  );

  const foot = (
    <footer className="card__foot">
      {/* Seeded jokes have no author; only submitted posts get a byline. */}
      {author ? (
        <p className="byline">
          <span className="avatar avatar--xs" aria-hidden="true">
            {photo ? <img src={photo} alt="" /> : initials(joke.author?.first_name, joke.author?.last_name)}
          </span>
          {isAi ? "prompted by " : null}
          <Link href={`/people/${joke.author_id}`} className="byline__link">
            {author}
          </Link>
        </p>
      ) : null}

      <RateControl jokeId={joke.id} myRating={joke.myRating} signedIn={signedIn} />
    </footer>
  );

  // The punchline stays behind the tap.
  return (
    <article className="card">
      {head}

      {/* Only ever set on an AI post, and optional even there — pressing
          Generate with the topic box empty is the common case. */}
      {isAi && joke.prompt ? (
        <p className="card__prompt">asked for: {joke.prompt}</p>
      ) : null}

      <p className="card__setup">{joke.setup}</p>

      <button
        type="button"
        className="card__toggle"
        onClick={() => setRevealed((r) => !r)}
        aria-expanded={revealed}
      >
        <span className={`card__caret${revealed ? " card__caret--open" : ""}`} aria-hidden="true">
          ▸
        </span>
        {revealed ? "hide" : "tap to reveal"}
      </button>

      {/* Kept mounted and hidden rather than unmounted, so the punchline is in
          the server-rendered HTML and the card does not jump on reveal. */}
      <p
        className={`card__punchline${revealed ? " card__punchline--shown" : ""}`}
        hidden={!revealed}
      >
        {joke.punchline}
      </p>

      {foot}
    </article>
  );
}
