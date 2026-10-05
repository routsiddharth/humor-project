"use client";

import { useState } from "react";

import { AverageStars, RateControl } from "@/components/stars";
import { avatarUrl, displayName, initials } from "@/lib/avatar";
import { memeImageUrl } from "@/lib/memes";
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

  // Shared by both shapes: the chips and average above, the byline and rating
  // below. Only the middle differs.
  const head = (
    <header className="card__head">
      <span className="chip">{joke.category}</span>
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
          {author}
        </p>
      ) : null}

      <RateControl jokeId={joke.id} myRating={joke.myRating} signedIn={signedIn} />
    </footer>
  );

  const image = memeImageUrl(joke.image_path);

  // A meme is the picture. There is nothing to reveal — whatever it says is
  // already in the image — so it just sits there and you scroll past it.
  if (joke.kind === "image" && image) {
    return (
      <article className="card card--meme">
        {head}
        {/* width/height are the intrinsic pixel size, so the browser reserves
            the right box before the bytes land and the grid stops jumping as
            images stream in. The CSS overrides the rendered size; these two
            only establish the ratio. */}
        <img
          className="card__image"
          src={image}
          alt={joke.image_alt ?? "Meme"}
          width={joke.image_width ?? undefined}
          height={joke.image_height ?? undefined}
          loading="lazy"
          decoding="async"
        />
        {foot}
      </article>
    );
  }

  // A written joke keeps its punchline behind the tap.
  return (
    <article className="card">
      {head}

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
