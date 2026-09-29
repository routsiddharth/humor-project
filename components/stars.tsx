"use client";

import Link from "next/link";
import { startTransition, useOptimistic, useState } from "react";

import { rateJoke } from "@/app/jokes/actions";

const STARS = [1, 2, 3, 4, 5];

// Read-only average. Renders nothing at all when nobody has voted — an unrated
// joke shows no stars rather than an empty five-star skeleton.
export function AverageStars({
  average,
  count,
}: {
  average: number | null;
  count: number;
}) {
  // PostgREST can hand numeric back as a string, so coerce rather than trust.
  const value = average === null ? null : Number(average);
  if (!count || value === null || Number.isNaN(value)) return null;

  const rounded = value.toFixed(1);

  return (
    <span
      className="rating-summary"
      title={`${rounded} out of 5 from ${count} ${count === 1 ? "vote" : "votes"}`}
    >
      {/* Two stacked copies: grey underneath, gold on top clipped to the
          average, so 3.5 renders as three and a half filled stars. */}
      <span className="stars-meter" aria-hidden="true">
        <span className="stars-meter__track">★★★★★</span>
        <span
          className="stars-meter__fill"
          style={{ width: `${(value / 5) * 100}%` }}
        >
          ★★★★★
        </span>
      </span>
      <span className="rating-summary__text">
        {rounded}
        <span className="rating-summary__count"> ({count})</span>
      </span>
    </span>
  );
}

// Interactive control. Signed-out visitors get a link instead of dead stars.
export function RateControl({
  jokeId,
  myRating,
  signedIn,
}: {
  jokeId: number;
  myRating: number | null;
  signedIn: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimisticRating, setOptimisticRating] = useOptimistic(myRating);

  if (!signedIn) {
    return (
      <p className="rate rate--signed-out">
        <Link href="/login" className="rate__link">
          Sign in
        </Link>{" "}
        to rate
      </p>
    );
  }

  function cast(value: number) {
    // Clicking the star you already chose clears the vote.
    const next = value === optimisticRating ? null : value;

    setError(null);
    startTransition(async () => {
      // Must be inside the transition, alongside the action it is predicting.
      setOptimisticRating(next);
      const result = await rateJoke(jokeId, next);
      // On failure React reverts the optimistic value when the transition
      // settles; this just explains why the star sprang back.
      if (result.error) setError(result.error);
    });
  }

  const preview = hovered ?? optimisticRating ?? 0;

  return (
    <div className="rate">
      <span className="rate__label">
        {optimisticRating ? "Your rating" : "Rate it"}
      </span>

      <span
        className="rate__stars"
        role="radiogroup"
        aria-label="Your rating"
        onMouseLeave={() => setHovered(null)}
      >
        {STARS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={optimisticRating === value}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            className={`rate__star${value <= preview ? " rate__star--on" : ""}`}
            onMouseEnter={() => setHovered(value)}
            onFocus={() => setHovered(value)}
            onBlur={() => setHovered(null)}
            onClick={() => cast(value)}
          >
            ★
          </button>
        ))}
      </span>

      {optimisticRating ? (
        <span className="rate__hint">click again to clear</span>
      ) : null}

      {error ? (
        <span className="rate__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
