// A post is either a written joke (setup + punchline) or a meme (just the
// image — its words are in the picture). `kind` says which, and the
// jokes_payload_check constraint keeps the columns consistent with it: neither
// shape borrows a column from the other.
export type JokeKind = "text" | "image";

// What wrote a post, which is a different question from what shape it is. 'ai'
// implies kind === "text": Claude writes text, not pictures, and 0007's
// jokes_ai_is_text_check refuses any other combination.
export type JokeSource = "human" | "ai";

export type Joke = {
  id: number;
  kind: JokeKind;
  // Both NULL on a meme, which has no text of its own — whatever it says is
  // part of the picture.
  setup: string | null;
  punchline: string | null;
  // Object path inside the `memes` bucket, never the image bytes. NULL on a
  // written joke.
  image_path: string | null;
  // Optional, and only ever set on a meme. Used as the image's alt text.
  image_alt: string | null;
  // Intrinsic pixel size, read off the header at upload time, so the card can
  // reserve the image's shape before it loads. NULL on a written joke, and on
  // a meme whose format the parser did not recognise.
  image_width: number | null;
  image_height: number | null;
  category: string;
  created_at: string;
  author_id: string | null;
  // Provenance, kept beside `kind` rather than inside it. author_id is who
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
  // Wilson lower bound on the win rate, 0–1.
  score: number;
};

export type ShowdownJokeRow = ShowdownJokeStats & {
  joke: Pick<Joke, "id" | "setup" | "punchline" | "category" | "source" | "model"> & {
    author: JokeAuthor | null;
  };
};

// One row of showdown_human_leaderboard(). Counts only — never a voter.
export type ShowdownHumanRow = {
  author_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
  jokes: number;
  wins: number;
  losses: number;
  voters: number;
  score: number;
  qualified: boolean;
};
