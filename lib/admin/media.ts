import "server-only";

import { assertAdmin } from "@/lib/admin/dal";
import { one, query } from "@/lib/admin/db";

// AI-generated media: rows of public.jokes with source = 'ai' (always written
// jokes — 0007's jokes_ai_is_text_check refuses an AI meme), plus the
// `generations` ledger every one of them came out of. Every query here is
// scoped to source = 'ai', so the CRUD below can never touch a human's post.

export type AiJoke = {
  id: number;
  setup: string;
  punchline: string;
  category: string;
  prompt: string | null;
  model: string;
  generation_id: number | null;
  created_at: string;
  rating_avg: number | null;
  rating_count: number;
  author_id: string | null;
  first_name: string | null;
  last_name: string | null;
  elo: number | null;
  wins: number;
  losses: number;
};

const COLUMNS = `
  j.id::int, j.setup, j.punchline, j.category, j.prompt, j.model, j.generation_id::int, j.created_at,
  j.rating_avg::float, j.rating_count, j.author_id, p.first_name, p.last_name,
  case when s.completed > 0 then s.rating::float end as elo,
  coalesce(s.wins, 0) as wins, coalesce(s.losses, 0) as losses`;

const FROM = `
  from public.jokes j
  left join public.profiles p on p.id = j.author_id
  left join public.showdown_joke_stats s on s.joke_id = j.id`;

export const MEDIA_SORTS = {
  newest: "j.created_at desc",
  oldest: "j.created_at asc",
  stars: "j.rating_avg desc nulls last, j.rating_count desc",
  elo: "elo desc nulls last",
  votes: "j.rating_count desc",
} as const;
export type MediaSort = keyof typeof MEDIA_SORTS;

export const PAGE_SIZE = 25;

export async function listAiJokes({ q, category, model, sort, page }:
  { q: string; category: string; model: string; sort: MediaSort; page: number }) {
  await assertAdmin();
  const where = `
    where j.source = 'ai'
      and ($1 = '' or j.setup ilike '%' || $1 || '%' or j.punchline ilike '%' || $1 || '%'
                   or coalesce(j.prompt, '') ilike '%' || $1 || '%')
      and ($2 = '' or j.category = $2)
      and ($3 = '' or j.model = $3)`;
  const params = [q, category, model];
  const [rows, count, facets] = await Promise.all([
    query<AiJoke>(
      `select ${COLUMNS} ${FROM} ${where} order by ${MEDIA_SORTS[sort]}, j.id desc
        limit ${PAGE_SIZE} offset $4`,
      [...params, (page - 1) * PAGE_SIZE]),
    one<{ n: number }>(`select count(*)::int as n from public.jokes j ${where}`, params),
    one<{ categories: string[]; models: string[] }>(
      `select coalesce(array_agg(distinct category order by category), '{}') as categories,
              coalesce(array_agg(distinct model order by model), '{}')       as models
         from public.jokes where source = 'ai'`),
  ]);
  return { rows, total: count?.n ?? 0, categories: facets?.categories ?? [], models: facets?.models ?? [] };
}

export async function getAiJoke(id: number) {
  await assertAdmin();
  const joke = await one<AiJoke>(`select ${COLUMNS} ${FROM} where j.id = $1 and j.source = 'ai'`, [id]);
  if (!joke) return null;

  const [ratings, matches, generation] = await Promise.all([
    query<{ user_id: string; first_name: string | null; last_name: string | null; rating: number; updated_at: string }>(
      `select r.user_id, p.first_name, p.last_name, r.rating, r.updated_at
         from public.ratings r join public.profiles p on p.id = r.user_id
        where r.joke_id = $1 order by r.updated_at desc`, [id]),
    query<{ id: number; voted_at: string; won: boolean; opp_id: number; opp_setup: string | null; opp_source: string;
            voter_first: string | null; voter_last: string | null }>(
      `select m.id::int, m.voted_at, m.winner_joke_id = $1 as won,
              o.id::int as opp_id, o.setup as opp_setup, o.source as opp_source,
              v.first_name as voter_first, v.last_name as voter_last
         from public.showdown_matches m
         join public.jokes o on o.id = case when m.left_joke_id = $1 then m.right_joke_id else m.left_joke_id end
         join public.profiles v on v.id = m.voter_id
        where $1 in (m.left_joke_id, m.right_joke_id) and m.voted_at is not null
        order by m.voted_at desc limit 50`, [id]),
    joke.generation_id
      ? one<{ candidates: { setup: string; punchline: string }[]; created_at: string }>(
          `select candidates, created_at from public.generations where id = $1`, [joke.generation_id])
      : Promise.resolve(null),
  ]);

  return { joke, ratings, matches, generation };
}

export async function listCategories() {
  await assertAdmin();
  const rows = await query<{ category: string }>(
    `select category from public.jokes group by category order by count(*) desc`);
  return rows.map((r) => r.category);
}

export type LedgerRow = {
  id: number; prompt: string | null; model: string; category: string; created_at: string;
  setup: string; punchline: string; first_name: string | null; last_name: string | null; user_id: string;
  posted_id: number | null;
};

export async function listGenerations({ page, status }: { page: number; status: "all" | "posted" | "unposted" }) {
  await assertAdmin();
  const where = status === "posted" ? "where j.id is not null" : status === "unposted" ? "where j.id is null" : "";
  const [rows, count] = await Promise.all([
    query<LedgerRow>(
      `select g.id::int, g.prompt, g.model, g.category, g.created_at,
              g.candidates -> 0 ->> 'setup' as setup, g.candidates -> 0 ->> 'punchline' as punchline,
              p.first_name, p.last_name, g.user_id, j.id::int as posted_id
         from public.generations g
         join public.profiles p on p.id = g.user_id
         left join public.jokes j on j.generation_id = g.id
         ${where}
        order by g.created_at desc limit ${PAGE_SIZE} offset $1`, [(page - 1) * PAGE_SIZE]),
    one<{ n: number }>(
      `select count(*)::int as n from public.generations g left join public.jokes j on j.generation_id = g.id ${where}`),
  ]);
  return { rows, total: count?.n ?? 0 };
}
