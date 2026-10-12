import Link from "next/link";
import { notFound } from "next/navigation";

import { JokeCard } from "@/components/joke-card";
import { Masonry } from "@/components/masonry";
import { requireCompleteProfile } from "@/lib/auth";
import { avatarUrl, displayName, initials } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";
import type { JokeForViewer, JokeWithAuthor, Profile } from "@/lib/types";

export const metadata = { title: "Profile · humor-project" };

export const dynamic = "force-dynamic";

// profiles.id is auth.users.id. Checked up front so a mangled URL is a 404
// rather than a Postgres "invalid input syntax for type uuid" error.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { user } = await requireCompleteProfile(`/people/${id}`);
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();

  const { data: person } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle<Profile>();
  if (!person) notFound();

  const isMe = person.id === user.id;

  // Same embed as /jokes — see the note there on why the constraint is named.
  // Newest first: this is someone's history, not a ranking.
  const { data: jokes, error } = await supabase
    .from("jokes")
    .select("*, author:profiles!jokes_author_id_fkey(first_name, last_name, avatar_path)")
    .eq("author_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<JokeWithAuthor[]>();

  // Only ever the viewer's own votes, as on /jokes.
  const myRatings = new Map<number, number>();
  const ids = (jokes ?? []).map((joke) => joke.id);
  if (ids.length) {
    const { data: voteRows } = await supabase
      .from("ratings")
      .select("joke_id, rating")
      .eq("user_id", user.id)
      .in("joke_id", ids)
      .returns<{ joke_id: number; rating: number }[]>();
    for (const row of voteRows ?? []) myRatings.set(row.joke_id, row.rating);
  }

  const cards: JokeForViewer[] = (jokes ?? []).map((joke) => ({
    ...joke,
    myRating: myRatings.get(joke.id) ?? null,
  }));

  // Weighted by vote count, so one 5-star post does not outweigh a 4-star post
  // with forty votes.
  const votes = cards.reduce((sum, joke) => sum + joke.rating_count, 0);
  const weighted = cards.reduce(
    (sum, joke) => sum + (joke.rating_avg ?? 0) * joke.rating_count,
    0,
  );
  const average = votes ? (weighted / votes).toFixed(2) : "—";
  const aiCount = cards.filter((joke) => joke.source === "ai").length;

  const name = displayName(person.first_name, person.last_name) ?? "Someone";
  const photo = avatarUrl(person.avatar_path);

  return (
    <main className="page">
      <header className="page__head person">
        <span className="avatar avatar--lg" aria-hidden="true">
          {photo ? <img src={photo} alt="" /> : initials(person.first_name, person.last_name)}
        </span>
        <div className="person__text">
          <h1 className="page__title">{isMe ? "Your posts" : name}</h1>
          <p className="page__sub">
            {isMe
              ? "Everything you've posted, newest first."
              : `Everything ${person.first_name ?? name} has posted, newest first.`}
          </p>
        </div>
        {isMe ? (
          <Link href="/profile" className="btn btn--ghost btn--sm person__edit">
            Edit profile
          </Link>
        ) : null}
      </header>

      {error ? null : (
        <dl className="person__stats">
          <Stat label="Posts" value={cards.length} />
          <Stat label="AI-assisted" value={aiCount} />
          <Stat label="Votes received" value={votes} />
          <Stat label="Avg rating" value={average} />
        </dl>
      )}

      {error ? (
        <div className="notice notice--error">
          <strong>Query failed:</strong> {error.message}
        </div>
      ) : !cards.length ? (
        <div className="notice">
          {isMe ? (
            <>
              Nothing yet.{" "}
              <Link href="/submit" className="notice__link">
                Post your first joke
              </Link>{" "}
              or{" "}
              <Link href="/generate" className="notice__link">
                generate one
              </Link>
              .
            </>
          ) : (
            `${name} hasn't posted anything yet.`
          )}
        </div>
      ) : (
        <Masonry>
          {cards.map((joke) => (
            <li key={joke.id}>
              <JokeCard joke={joke} signedIn />
            </li>
          ))}
        </Masonry>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <dt className="stat__label">{label}</dt>
      <dd className="stat__value">{value}</dd>
    </div>
  );
}
