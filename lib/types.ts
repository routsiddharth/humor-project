export type Joke = {
  id: number;
  setup: string;
  punchline: string;
  category: string;
  created_at: string;
  author_id: string | null;
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
