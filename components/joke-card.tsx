"use client";

import { useState } from "react";

import { avatarUrl, displayName, initials } from "@/lib/avatar";
import type { JokeWithAuthor } from "@/lib/types";

// The only Client Component on the page. The list itself is server-rendered;
// this exists purely so the punchline can stay hidden until asked for.
export function JokeCard({ joke }: { joke: JokeWithAuthor }) {
  const [revealed, setRevealed] = useState(false);

  const author = displayName(joke.author?.first_name, joke.author?.last_name);
  const photo = avatarUrl(joke.author?.avatar_path);

  return (
    <article className="card">
      <header className="card__head">
        <span className="chip">{joke.category}</span>
        <span className="stars" aria-label={`Rated ${joke.rating} out of 5`}>
          <span aria-hidden="true">
            {"★".repeat(joke.rating)}
            <span className="stars__empty">{"★".repeat(5 - joke.rating)}</span>
          </span>
        </span>
      </header>

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
      <p className={`card__punchline${revealed ? " card__punchline--shown" : ""}`} hidden={!revealed}>
        {joke.punchline}
      </p>

      {/* Seeded jokes have no author; only submitted ones get a byline. */}
      {author ? (
        <p className="byline">
          <span className="avatar avatar--xs" aria-hidden="true">
            {photo ? <img src={photo} alt="" /> : initials(joke.author?.first_name, joke.author?.last_name)}
          </span>
          {author}
        </p>
      ) : null}
    </article>
  );
}
