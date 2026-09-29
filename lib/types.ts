export type Joke = {
  id: number;
  setup: string;
  punchline: string;
  category: string;
  rating: number;
  created_at: string;
  author_id: string | null;
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
