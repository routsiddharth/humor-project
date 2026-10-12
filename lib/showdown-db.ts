import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { JokeSource, ShowdownPair, ShowdownReveal } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type MatchRow = {
  match_id: number;
  left_id: number;
  left_setup: string;
  left_punchline: string;
  right_id: number;
  right_setup: string;
  right_punchline: string;
};

type VoteRow = {
  status: string;
  left_id: number | null;
  left_source: JokeSource | null;
  right_id: number | null;
  right_source: JokeSource | null;
  winner_id: number | null;
};

export type PairResult =
  | { pair: ShowdownPair | null }
  | { error: string };

// The caller's open pair, or a freshly issued one; `pair: null` means there are
// not two eligible jokes to show. Runs as the signed-in user, so auth.uid()
// inside the function is them.
export async function loadPair(supabase: Supabase): Promise<PairResult> {
  const { data, error } = await supabase
    .rpc("showdown_next_match")
    .maybeSingle<MatchRow>();

  if (error) return { error: describe(error.message) };
  if (!data) return { pair: null };

  // Copied field by field rather than spread. This object is serialized into
  // the page for the browser, and spreading would forward whatever the
  // function returns tomorrow — including a column that names the author.
  return {
    pair: {
      matchId: Number(data.match_id),
      left: {
        id: Number(data.left_id),
        setup: data.left_setup,
        punchline: data.left_punchline,
      },
      right: {
        id: Number(data.right_id),
        setup: data.right_setup,
        punchline: data.right_punchline,
      },
    },
  };
}

export type CastResult =
  | { status: "ok" | "already_voted"; reveal: ShowdownReveal }
  | {
      status:
        | "rate_limited"
        | "not_found"
        | "expired"
        | "invalid_winner"
        | "too_fast";
    }
  | { status: "error"; error: string };

export async function castVote(
  supabase: Supabase,
  matchId: number,
  winnerId: number,
): Promise<CastResult> {
  const { data, error } = await supabase
    .rpc("showdown_vote", { p_match_id: matchId, p_winner_id: winnerId })
    .single<VoteRow>();

  if (error) return { status: "error", error: describe(error.message) };

  if (data.status === "ok" || data.status === "already_voted") {
    return {
      status: data.status,
      reveal: {
        winnerId: Number(data.winner_id),
        left: { id: Number(data.left_id), source: data.left_source as JokeSource },
        right: { id: Number(data.right_id), source: data.right_source as JokeSource },
      },
    };
  }

  switch (data.status) {
    case "rate_limited":
    case "not_found":
    case "expired":
    case "invalid_winner":
    case "too_fast":
      return { status: data.status };
    default:
      return { status: "error", error: `Unexpected vote status: ${data.status}` };
  }
}

// The functions raise these two by name (0009); everything else is passed
// through as the database said it.
function describe(message: string): string {
  if (message.includes("not_authenticated")) return "Your session expired. Sign in again to keep voting.";
  if (message.includes("incomplete_profile")) return "Finish setting up your profile to play.";
  return message;
}
