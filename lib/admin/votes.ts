import "server-only";

import { assertAdmin } from "@/lib/admin/dal";
import { one, query } from "@/lib/admin/db";

// READ-only. Two kinds of vote live in this database:
//   ratings           — 1–5 stars, one per person per post (0003)
//   showdown_matches  — blind head-to-head picks: an upvote for the winner and
//                       a downvote for the loser in the same row (0009)
// Neither has a write path here. Votes belong to the people who cast them, and
// the Elo ratings are a replay of the match log, so editing one would be
// rewriting history.

export const PAGE_SIZE = 40;

export type RatingRow = {
  joke_id: number; user_id: string; rating: number; created_at: string; updated_at: string;
  first_name: string | null; last_name: string | null;
  source: string; setup: string | null; category: string;
};

export async function listRatings({ stars, source, page }: { stars: number; source: string; page: number }) {
  await assertAdmin();
  const where = `
    where ($1 = 0 or r.rating = $1)
      and ($2 = '' or j.source = $2)`;
  const params = [stars, source];
  const [rows, count, summary] = await Promise.all([
    query<RatingRow>(
      `select r.joke_id::int, r.user_id, r.rating, r.created_at, r.updated_at,
              p.first_name, p.last_name, j.source, j.setup, j.category
         from public.ratings r
         join public.profiles p on p.id = r.user_id
         join public.jokes j on j.id = r.joke_id
         ${where}
        order by r.updated_at desc limit ${PAGE_SIZE} offset $3`, [...params, (page - 1) * PAGE_SIZE]),
    one<{ n: number }>(
      `select count(*)::int as n from public.ratings r join public.jokes j on j.id = r.joke_id ${where}`, params),
    one<{ total: number; avg: number | null; raters: number; changed: number; by_star: number[] }>(
      `select count(*)::int as total, avg(rating)::float as avg, count(distinct user_id)::int as raters,
              count(*) filter (where updated_at > created_at + interval '1 second')::int as changed,
              array[count(*) filter (where rating = 1), count(*) filter (where rating = 2),
                    count(*) filter (where rating = 3), count(*) filter (where rating = 4),
                    count(*) filter (where rating = 5)]::int[] as by_star
         from public.ratings`),
  ]);
  return { rows, total: count?.n ?? 0, summary: summary! };
}

export type MatchRow = {
  id: number; created_at: string; voted_at: string | null;
  voter_id: string; first_name: string | null; last_name: string | null;
  left_id: number; left_setup: string | null; left_source: string;
  right_id: number; right_setup: string | null; right_source: string;
  winner_id: number | null;
};

export async function listMatches({ status, page }: { status: "voted" | "open" | "all"; page: number }) {
  await assertAdmin();
  const where =
    status === "voted" ? "where m.voted_at is not null" : status === "open" ? "where m.voted_at is null" : "";
  const [rows, count, summary] = await Promise.all([
    query<MatchRow>(
      `select m.id::int, m.created_at, m.voted_at, m.voter_id, p.first_name, p.last_name,
              l.id::int as left_id, l.setup as left_setup, l.source as left_source,
              r.id::int as right_id, r.setup as right_setup, r.source as right_source,
              m.winner_joke_id::int as winner_id
         from public.showdown_matches m
         join public.profiles p on p.id = m.voter_id
         join public.jokes l on l.id = m.left_joke_id
         join public.jokes r on r.id = m.right_joke_id
         ${where}
        order by coalesce(m.voted_at, m.created_at) desc limit ${PAGE_SIZE} offset $1`, [(page - 1) * PAGE_SIZE]),
    one<{ n: number }>(`select count(*)::int as n from public.showdown_matches m ${where}`),
    one<{ issued: number; voted: number; voters: number; left_wins: number; median_secs: number | null }>(
      `select count(*)::int as issued, count(voted_at)::int as voted,
              count(distinct voter_id) filter (where voted_at is not null)::int as voters,
              count(*) filter (where winner_joke_id = left_joke_id)::int as left_wins,
              percentile_cont(0.5) within group (order by extract(epoch from voted_at - created_at))
                filter (where voted_at is not null)::float as median_secs
         from public.showdown_matches`),
  ]);
  return { rows, total: count?.n ?? 0, summary: summary! };
}
