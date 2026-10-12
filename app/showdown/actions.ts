"use server";

import { castVote, loadPair } from "@/lib/showdown-db";
import { createClient } from "@/lib/supabase/server";
import type { ShowdownPair, ShowdownReveal } from "@/lib/types";

export type VoteResult = {
  // 'ok' and 'already_voted' carry a reveal; a replayed double-click gets the
  // same one back rather than an error.
  status:
    | "ok"
    | "already_voted"
    | "expired"
    | "not_found"
    | "too_fast"
    | "rate_limited"
    | "invalid_winner"
    | "error";
  reveal?: ShowdownReveal;
  // The pair to show next, fetched in the same round trip so the reveal can
  // hand straight over to it. Absent when the vote did not go through and the
  // current pair is still the one to vote on; null when the pool is empty.
  next?: ShowdownPair | null;
  error?: string;
};

// Only ids go in. Everything that decides whether the vote counts — whose
// match it is, whether it is still open, whether the winner is one of its two
// jokes — is checked inside showdown_vote, in the same statement that records
// it, so neither a forged POST nor a double-click can count twice.
export async function submitShowdownVote(
  matchId: number,
  winnerJokeId: number,
): Promise<VoteResult> {
  if (!Number.isInteger(matchId) || !Number.isInteger(winnerJokeId)) {
    return { status: "invalid_winner", error: "That is not one of the two jokes." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", error: "Your session expired. Sign in again to keep voting." };
  }

  const vote = await castVote(supabase, matchId, winnerJokeId);

  switch (vote.status) {
    case "ok":
    case "already_voted":
    case "expired":
    case "not_found": {
      // Each of these closes the current pair one way or another, so the
      // screen needs the next one.
      const next = await loadPair(supabase);
      return {
        status: vote.status,
        reveal: "reveal" in vote ? vote.reveal : undefined,
        ...("error" in next ? { error: next.error } : { next: next.pair }),
      };
    }
    case "too_fast":
      return { status: "too_fast", error: "Give both a proper read first." };
    case "rate_limited":
      return {
        status: "rate_limited",
        error: "That is faster than anyone reads. Take a breath and try again in a minute.",
      };
    case "invalid_winner":
      return { status: "invalid_winner", error: "That is not one of the two jokes." };
    case "error":
      return { status: "error", error: vote.error };
  }
}

// For the "try again" button after a failed load, and for an empty pool that
// may have filled since.
export async function loadShowdownPair(): Promise<{
  pair?: ShowdownPair | null;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again to keep voting." };

  return loadPair(supabase);
}
