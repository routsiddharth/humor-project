"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { loadShowdownPair, submitShowdownVote } from "@/app/showdown/actions";
import { REVEAL_MS } from "@/lib/showdown";
import type { JokeSource, ShowdownJoke, ShowdownPair, ShowdownReveal } from "@/lib/types";

type Phase =
  | { kind: "choosing" }
  | { kind: "sending"; pick: number }
  // `next` is already fetched — the vote action returns it — so the reveal is
  // only ever waiting on the timer, never on the network.
  | { kind: "revealed"; pick: number; reveal: ShowdownReveal; next: ShowdownPair | null };

const SOURCE_LABEL: Record<JokeSource, string> = { human: "Human", ai: "AI" };

export function Showdown({
  initialPair,
  initialError,
}: {
  initialPair: ShowdownPair | null;
  initialError: string | null;
}) {
  const [pair, setPair] = useState(initialPair);
  const [phase, setPhase] = useState<Phase>({ kind: "choosing" });
  // A recoverable hiccup shown above the pair: too fast, an expired match.
  const [message, setMessage] = useState<string | null>(null);
  // A failed load, which leaves nothing to vote on.
  const [loadError, setLoadError] = useState(initialError);
  const [reloading, setReloading] = useState(false);

  // State updates land on the next render, so two clicks inside one frame
  // would both see phase "choosing". A ref closes that gap; the database
  // would only count one of them anyway, but the second would flash an error.
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const advance = useCallback((next: ShowdownPair | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    busy.current = false;
    setPair(next);
    setPhase({ kind: "choosing" });
  }, []);

  const choose = useCallback(
    (jokeId: number) => {
      if (!pair || busy.current) return;
      busy.current = true;
      setMessage(null);
      setPhase({ kind: "sending", pick: jokeId });

      startTransition(async () => {
        let result;
        try {
          result = await submitShowdownVote(pair.matchId, jokeId);
        } catch {
          result = { status: "error" as const, error: "Could not reach the server. Try again." };
        }

        if ((result.status === "ok" || result.status === "already_voted") && result.reveal) {
          if (result.error) setLoadError(result.error);
          const next = result.next ?? null;
          setPhase({ kind: "revealed", pick: jokeId, reveal: result.reveal, next });
          timer.current = setTimeout(() => advance(next), REVEAL_MS);
          return;
        }

        // The pair is gone — timed out, or not this voter's — so move on to
        // whatever the server issued instead of leaving a dead pair up.
        if (result.status === "expired" || result.status === "not_found") {
          setMessage("That pair timed out, so here is a fresh one.");
          if (result.error) setLoadError(result.error);
          advance(result.next ?? null);
          return;
        }

        // Everything else leaves the same pair up to vote on again.
        busy.current = false;
        setMessage(result.error ?? "Something went wrong. Try again.");
        setPhase({ kind: "choosing" });
      });
    },
    [pair, advance],
  );

  async function reload() {
    setReloading(true);
    setMessage(null);
    try {
      const result = await loadShowdownPair();
      setLoadError(result.error ?? null);
      if (!result.error) advance(result.pair ?? null);
    } catch {
      setLoadError("Could not reach the server. Try again.");
    } finally {
      setReloading(false);
    }
  }

  // A and B, or the arrow keys, as well as Tab + Enter on the cards
  // themselves. Enter or Space during a reveal skips the wait.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;

      if (phase.kind === "choosing" && pair) {
        const key = event.key.toLowerCase();
        if (key === "a" || key === "arrowleft") choose(pair.left.id);
        else if (key === "b" || key === "arrowright") choose(pair.right.id);
        else return;
        event.preventDefault();
      } else if (phase.kind === "revealed" && event.key === "Enter" && target?.tagName !== "BUTTON") {
        event.preventDefault();
        advance(phase.next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, pair, choose, advance]);

  if (loadError && !pair) {
    return (
      <div className="notice notice--error" role="alert">
        <strong>Could not load a pair.</strong> {loadError}{" "}
        <button type="button" className="notice__link notice__button" onClick={reload} disabled={reloading}>
          {reloading ? "Trying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="notice">
        Not enough jokes to pair up right now — you are never shown your own,
        and only written jokes compete.{" "}
        <Link href="/submit" className="notice__link">
          Post one
        </Link>{" "}
        or{" "}
        <button type="button" className="notice__link notice__button" onClick={reload} disabled={reloading}>
          {reloading ? "checking…" : "check again"}
        </button>
        .
      </div>
    );
  }

  const revealed = phase.kind === "revealed" ? phase : null;
  const pick = phase.kind === "choosing" ? null : phase.pick;
  const locked = phase.kind !== "choosing";

  const sourceOf = (joke: ShowdownJoke): JokeSource | null => {
    if (!revealed) return null;
    if (revealed.reveal.left.id === joke.id) return revealed.reveal.left.source;
    if (revealed.reveal.right.id === joke.id) return revealed.reveal.right.source;
    return null;
  };

  const announcement = revealed
    ? `You picked ${revealed.pick === pair.left.id ? "A" : "B"}. A was written by ${
        sourceOf(pair.left) === "ai" ? "AI" : "a human"
      }, B by ${sourceOf(pair.right) === "ai" ? "AI" : "a human"}.`
    : "";

  return (
    <section className="showdown" aria-label="Pick the funnier joke">
      {message ? (
        <p className="notice showdown__message" role="status">
          {message}
        </p>
      ) : null}

      {/* The matchId key restarts the entrance animation on each new pair
          without remounting the buttons themselves, so keyboard focus stays
          on the card you used. */}
      <div className="showdown__pair">
        {[
          { joke: pair.left, label: "A" },
          { joke: pair.right, label: "B" },
        ].map(({ joke, label }) => {
          const source = sourceOf(joke);
          const chosen = pick === joke.id;
          return (
            <button
              key={label}
              type="button"
              className={[
                "duel",
                chosen ? "duel--picked" : "",
                locked && !chosen ? "duel--other" : "",
              ].join(" ")}
              onClick={() => choose(joke.id)}
              // aria-disabled rather than disabled: a disabled button drops
              // focus to <body>, and the next pair would start with the
              // keyboard user lost at the top of the page.
              aria-disabled={locked}
              aria-pressed={chosen}
              aria-keyshortcuts={label}
            >
              <span className="duel__top">
                <span className="duel__label" aria-hidden="true">
                  {label}
                </span>
                <span className="visually-hidden">Joke {label}: </span>
                {source ? (
                  <span className={`chip ${source === "ai" ? "chip--ai" : "chip--human"} duel__badge`}>
                    {SOURCE_LABEL[source]}
                  </span>
                ) : chosen ? (
                  <span className="duel__status">Counting…</span>
                ) : null}
              </span>

              <span key={pair.matchId} className="duel__body">
                <span className="duel__setup">{joke.setup}</span>
                <span className="duel__punchline">{joke.punchline}</span>
              </span>

              <span className="duel__foot" aria-hidden={!chosen}>
                {chosen ? "Your pick" : " "}
              </span>
            </button>
          );
        })}
      </div>

      <div className="showdown__bar">
        <p className="showdown__hint" aria-live="polite">
          {revealed ? (
            <>
              <span className="visually-hidden">{announcement} </span>
              <span aria-hidden="true">Next pair in a moment.</span>
            </>
          ) : (
            "Click a joke, or press A or B."
          )}
        </p>
        {revealed ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => advance(revealed.next)}>
            Next pair →
          </button>
        ) : null}
      </div>
    </section>
  );
}
