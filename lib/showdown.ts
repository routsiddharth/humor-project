// Showdown tuning, shared by the pages, the actions and the client component.
//
// Deliberately free of server-only imports, for the reason lib/generate.ts
// gives: components/showdown.tsx is a Client Component and reads REVEAL_MS.
//
// The thresholds are starting guesses, not findings. They are here, in one
// place, so they can move with real participation.

// How long both badges stay up after a vote before the next pair slides in.
// Keep it under the 2-second min_decision in showdown_vote (0009): the next
// pair is issued the moment the vote lands, so this delay is most of the
// reading time that check measures.
export const REVEAL_MS = 1600;

// Completed matchups before a joke leaves "Rising" for the main board.
export const JOKE_MIN_MATCHES = 10;

// Elo, rounded: nobody needs to see 1016.4823. Every joke starts at 1000
// (0010), so above 1000 is winning more than it loses against its opponents.
export function formatRating(rating: number): string {
  return String(Math.round(Number(rating)));
}

export function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

export function winRate(wins: number, losses: number): string {
  const total = wins + losses;
  return total ? `${Math.round((wins / total) * 100)}%` : "—";
}
