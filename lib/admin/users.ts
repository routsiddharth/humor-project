import "server-only";

import { assertAdmin } from "@/lib/admin/dal";
import { one, query } from "@/lib/admin/db";

// READ-only. Profiles are managed by their owners on the public site; the
// panel can look but has no write path to them (is_superadmin included — that
// is granted from the command line, see scripts/grant-admin.mjs).

export type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
  is_superadmin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  posts: number;
  ai_posts: number;
  ratings: number;
  votes: number;
  generations: number;
  avg_given: number | null;
};

const USER_COLUMNS = `
  p.id, u.email, p.first_name, p.last_name, p.avatar_path, p.is_superadmin,
  u.created_at, u.last_sign_in_at,
  (select count(*) from public.jokes j where j.author_id = p.id)::int                        as posts,
  (select count(*) from public.jokes j where j.author_id = p.id and j.source = 'ai')::int    as ai_posts,
  (select count(*) from public.ratings r where r.user_id = p.id)::int                        as ratings,
  (select count(*) from public.showdown_matches m where m.voter_id = p.id and m.voted_at is not null)::int as votes,
  (select count(*) from public.generations g where g.user_id = p.id)::int                    as generations,
  (select avg(r.rating)::float from public.ratings r where r.user_id = p.id)                 as avg_given`;

export const USER_SORTS = {
  joined: "u.created_at desc",
  active: "u.last_sign_in_at desc nulls last",
  posts: "posts desc, u.created_at desc",
  ratings: "ratings desc, u.created_at desc",
  name: "p.first_name nulls last, p.last_name",
} as const;
export type UserSort = keyof typeof USER_SORTS;

export async function listUsers({ q, sort }: { q: string; sort: UserSort }) {
  await assertAdmin();
  // The ORDER BY comes from a fixed map, never from the request, so it cannot
  // carry SQL. The search term is a bound parameter.
  return query<UserRow>(
    `select ${USER_COLUMNS}
       from public.profiles p join auth.users u on u.id = p.id
      where $1 = '' or u.email ilike '%' || $1 || '%'
            or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || $1 || '%'
      order by ${USER_SORTS[sort]}
      limit 500`,
    [q],
  );
}

export async function getUser(id: string) {
  await assertAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const user = await one<UserRow & { provider: string | null }>(
    `select ${USER_COLUMNS}, u.raw_app_meta_data ->> 'provider' as provider
       from public.profiles p join auth.users u on u.id = p.id where p.id = $1`,
    [id],
  );
  if (!user) return null;

  const [posts, ratings, generations] = await Promise.all([
    query<{ id: number; source: string; setup: string | null; punchline: string | null;
            category: string; rating_avg: number | null; rating_count: number; created_at: string; elo: number | null }>(
      `select j.id::int, j.source, j.setup, j.punchline, j.category, j.rating_avg::float,
              j.rating_count, j.created_at, s.rating::float as elo
         from public.jokes j left join public.showdown_joke_stats s on s.joke_id = j.id and s.completed > 0
        where j.author_id = $1 order by j.created_at desc limit 100`, [id]),
    query<{ joke_id: number; rating: number; updated_at: string; setup: string | null; source: string }>(
      `select r.joke_id::int, r.rating, r.updated_at, j.setup, j.source
         from public.ratings r join public.jokes j on j.id = r.joke_id
        where r.user_id = $1 order by r.updated_at desc limit 100`, [id]),
    query<{ id: number; prompt: string | null; model: string; category: string; created_at: string; posted_id: number | null }>(
      `select g.id::int, g.prompt, g.model, g.category, g.created_at, j.id::int as posted_id
         from public.generations g left join public.jokes j on j.generation_id = g.id
        where g.user_id = $1 order by g.created_at desc limit 100`, [id]),
  ]);

  return { user, posts, ratings, generations };
}
