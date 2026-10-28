// What wrote a joke: a person, or a prompt chain run on someone's behalf.
export type JokeSource = "human" | "ai";

export type Joke = {
  id: number;
  // Always "text" since 0017 dropped memes. The column stays because the
  // Showdown and generation SQL still filter on it.
  kind: "text";
  setup: string;
  punchline: string;
  category: string;
  created_at: string;
  author_id: string | null;
  // Provenance. author_id is who
  // posted it either way — on an AI post that means whoever prompted it.
  source: JokeSource;
  // Both NULL on a human post and both set on an AI one, enforced by
  // jokes_provenance_check. `prompt` is what the card reveals.
  prompt: string | null;
  model: string | null;
  // The ledger row this post came out of, or NULL once that row is gone. The
  // prompt/model above are the card's own copy for exactly that reason, so a
  // deleted history does not blank the badge on a post that is already public.
  generation_id: number | null;
  // Maintained by the ratings_changed trigger, never written by the app.
  // NULL with a count of 0 means nobody has voted — the card shows no stars.
  rating_avg: number | null;
  rating_count: number;
};

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
  // Opens /admin. Settable only by the service role or the database owner
  // (0012), never by the user it belongs to.
  is_superadmin: boolean;
  updated_at: string;
};

// Just the author fields the joke list embeds — not the whole profile.
export type JokeAuthor = Pick<Profile, "first_name" | "last_name" | "avatar_path">;

// PostgREST returns the embedded author as an object (or null) because
// jokes.author_id is a to-one foreign key.
export type JokeWithAuthor = Joke & { author: JokeAuthor | null };

// The signed-in viewer's own vote, merged in on the server so a card never
// receives anyone else's rating.
export type JokeForViewer = JokeWithAuthor & { myRating: number | null };

// One press of Generate: the prompt, and every candidate it came back with. The
// table is the rate-limit ledger first and the record of rejected phrasings
// second — a user who generates fifty times and posts once leaves fifty rows
// here and one in `jokes`.
export type GenerationCandidate = { setup: string; punchline: string };

export type Generation = {
  id: number;
  user_id: string;
  prompt: string;
  model: string;
  category: string;
  // jsonb. Stored in the order the candidates were offered; which one was
  // posted is not recorded here, it is jokes.generation_id pointing back.
  candidates: GenerationCandidate[];
  created_at: string;
};

// ---------- Showdown (0009) ----------

// Everything a voter is allowed to know about a joke before choosing. No
// source, author, model, prompt or rating — showdown_next_match returns only
// these columns, and lib/showdown-db.ts copies them field by field so a widened
// query cannot leak into the props.
export type ShowdownJoke = { id: number; setup: string; punchline: string };

export type ShowdownPair = {
  // The match row, which is also the token the vote is checked against.
  matchId: number;
  left: ShowdownJoke;
  right: ShowdownJoke;
};

// What the vote unlocks.
export type ShowdownReveal = {
  winnerId: number;
  left: { id: number; source: JokeSource };
  right: { id: number; source: JokeSource };
};

// One row of showdown_joke_stats, maintained by showdown_vote and never
// written by the app.
export type ShowdownJokeStats = {
  joke_id: number;
  appearances: number;
  wins: number;
  losses: number;
  wins_vs_human: number;
  losses_vs_human: number;
  wins_vs_ai: number;
  losses_vs_ai: number;
  completed: number;
  // Elo rating. Starts at 1000 and moves with every vote (0010).
  rating: number;
};

export type ShowdownJokeRow = ShowdownJokeStats & {
  joke: Pick<Joke, "id" | "setup" | "punchline" | "category" | "source" | "model"> & {
    author: JokeAuthor | null;
  };
};
