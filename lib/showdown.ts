// Showdown tuning, shared by the pages, the actions and the client component.
//
// Deliberately free of server-only imports, for the reason lib/generate.ts
// gives: components/showdown.tsx is a Client Component and reads REVEAL_MS.
//
// The thresholds are starting guesses, not findings. They are here, in one
// place, so they can move with real participation without a migration —
// showdown_human_leaderboard takes them as arguments for exactly that reason.

// How long both badges stay up after a vote before the next pair slides in.
// Keep it under the 2-second min_decision in showdown_vote (0009): the next
// pair is issued the moment the vote lands, so this delay is most of the
// reading time that check measures.
export const REVEAL_MS = 1600;

// Completed matchups before a joke leaves "Rising" for the main board.
export const JOKE_MIN_MATCHES = 10;

// A writer qualifies for the human boards with this many distinct human-written
// jokes, completed matchups, and different people having voted on them.
export const HUMAN_MIN_JOKES = 2;
export const HUMAN_MIN_MATCHES = 20;
export const HUMAN_MIN_VOTERS = 3;

export const BOARDS = [
  { value: "jokes", label: "Best jokes" },
  { value: "humans", label: "Top humans" },
  { value: "slayers", label: "AI slayers" },
] as const;

export type Board = (typeof BOARDS)[number]["value"];

// Untrusted search param; anything unrecognised is the default board.
export function parseBoard(value: string | string[] | undefined): Board {
  const candidate = Array.isArray(value) ? value[0] : value;
  return BOARDS.find((board) => board.value === candidate)?.value ?? "jokes";
}

// The Wilson lower bound as the number a person reads: 0.6213 → "62".
export function formatScore(score: number): string {
  return String(Math.round(Number(score) * 100));
}

export function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

export function winRate(wins: number, losses: number): string {
  const total = wins + losses;
  return total ? `${Math.round((wins / total) * 100)}%` : "—";
}
