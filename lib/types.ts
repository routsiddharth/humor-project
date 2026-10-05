// A post is either a written joke (setup + punchline) or a meme (just the
// image — its words are in the picture). `kind` says which, and the
// jokes_payload_check constraint keeps the columns consistent with it: neither
// shape borrows a column from the other.
export type JokeKind = "text" | "image";

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
