import "server-only";

import { assertAdmin } from "@/lib/admin/dal";
import { one, query } from "@/lib/admin/db";

// Every figure on the overview page, in one place. Each query is aggregate-only
// and runs as the database owner, which is why the whole module sits behind
// assertAdmin(): ratings and Showdown matches tie a person to an individual
// vote, and the public site never exposes them.

const TZ = "America/New_York";

export type Totals = {
  users: number;
  onboarded: number;
  admins: number;
  human_jokes: number;
  memes: number;
  ai_jokes: number;
  ratings: number;
  votes: number;
  generations: number;
  active_7d: number;
  posts_7d: number;
  posts_prev_7d: number;
};

export type SourceStat = { source: "human" | "ai"; avg_stars: number | null; star_votes: number; avg_elo: number | null; ranked: number };
export type HeadToHead = { matches: number; ai_wins: number };
export type StarRow = { grp: "human" | "ai" | "meme"; stars: number; n: number };
export type HeatCell = { dow: number; hr: number; n: number };
export type DayRow = { day: string; posts: number; ratings: number; votes: number; generations: number };
export type Funnel = { generated: number; posted: number; rated: number; won: number };
export type Divisive = {
  id: number; setup: string; punchline: string; source: string; category: string;
  n: number; avg: number; sd: number; dist: number[];
};
export type Ranked = { id: number; setup: string; punchline: string; source: string; rating: number; wins: number; losses: number };
export type Critic = { id: string; first_name: string | null; last_name: string | null; n: number; avg: number };
export type CategoryRow = { category: string; human: number; ai: number; memes: number; avg_stars: number | null };
export type Topic = { topic: string; n: number };
export type ModelRow = { model: string; n: number };

export async function getOverview() {
  await assertAdmin();

  const [
    totals, sources, h2h, stars, heat, days, funnel, divisive, top, bottom, critics, categories, topics, models,
  ] = await Promise.all([
    one<Totals>(`
      with recent as (
        select author_id as uid from public.jokes where created_at > now() - interval '7 days'
        union select user_id from public.ratings where updated_at > now() - interval '7 days'
        union select voter_id from public.showdown_matches where voted_at > now() - interval '7 days'
        union select user_id from public.generations where created_at > now() - interval '7 days'
      )
      select
        (select count(*) from public.profiles)::int                                            as users,
        (select count(*) from public.profiles where nullif(btrim(first_name), '') is not null)::int as onboarded,
        (select count(*) from public.profiles where is_superadmin)::int                        as admins,
        (select count(*) from public.jokes where source = 'human' and kind = 'text')::int     as human_jokes,
        (select count(*) from public.jokes where kind = 'image')::int                         as memes,
        (select count(*) from public.jokes where source = 'ai')::int                          as ai_jokes,
        (select count(*) from public.ratings)::int                                            as ratings,
        (select count(*) from public.showdown_matches where voted_at is not null)::int        as votes,
        (select count(*) from public.generations)::int                                        as generations,
        (select count(*) from recent where uid is not null)::int                              as active_7d,
        (select count(*) from public.jokes where created_at > now() - interval '7 days')::int as posts_7d,
        (select count(*) from public.jokes where created_at <= now() - interval '7 days'
                                              and created_at >  now() - interval '14 days')::int as posts_prev_7d`),

    query<SourceStat>(`
      select j.source,
             (select avg(r.rating)::float from public.ratings r join public.jokes x on x.id = r.joke_id
               where x.source = j.source and x.kind = 'text')                   as avg_stars,
             (select count(*)::int from public.ratings r join public.jokes x on x.id = r.joke_id
               where x.source = j.source and x.kind = 'text')                   as star_votes,
             avg(s.rating)::float                                               as avg_elo,
             count(s.joke_id)::int                                              as ranked
        from (values ('human'), ('ai')) as j(source)
        left join public.jokes jj on jj.source = j.source and jj.kind = 'text'
        left join public.showdown_joke_stats s on s.joke_id = jj.id and s.completed > 0
       group by j.source`),

    one<HeadToHead>(`
      select count(*)::int                               as matches,
             count(*) filter (where w.source = 'ai')::int as ai_wins
        from public.showdown_matches m
        join public.jokes l on l.id = m.left_joke_id
        join public.jokes r on r.id = m.right_joke_id
        join public.jokes w on w.id = m.winner_joke_id
       where m.voted_at is not null and l.source <> r.source`),

    query<StarRow>(`
      select case when j.kind = 'image' then 'meme' else j.source end as grp,
             r.rating::int as stars, count(*)::int as n
        from public.ratings r join public.jokes j on j.id = r.joke_id
       group by 1, 2`),

    query<HeatCell>(`
      with ev as (
        select created_at as t from public.jokes
        union all select created_at from public.ratings
        union all select voted_at from public.showdown_matches where voted_at is not null
        union all select created_at from public.generations
      )
      select extract(isodow from t at time zone '${TZ}')::int as dow,
             extract(hour   from t at time zone '${TZ}')::int as hr,
             count(*)::int as n
        from ev group by 1, 2`),

    query<DayRow>(`
      with days as (
        select generate_series((now() at time zone '${TZ}')::date - 59,
                               (now() at time zone '${TZ}')::date, interval '1 day')::date as d
      ),
      ev as (
        select 'posts' as k, created_at as t from public.jokes
        union all select 'ratings', created_at from public.ratings
        union all select 'votes', voted_at from public.showdown_matches where voted_at is not null
        union all select 'generations', created_at from public.generations
      )
      select to_char(d, 'YYYY-MM-DD') as day,
             count(ev.k) filter (where ev.k = 'posts')::int       as posts,
             count(ev.k) filter (where ev.k = 'ratings')::int     as ratings,
             count(ev.k) filter (where ev.k = 'votes')::int       as votes,
             count(ev.k) filter (where ev.k = 'generations')::int as generations
        from days
        left join ev on (ev.t at time zone '${TZ}')::date = days.d
       group by d order by d`),

    one<Funnel>(`
      select (select count(*) from public.generations)::int                                   as generated,
             (select count(*) from public.jokes where source = 'ai')::int                     as posted,
             (select count(*) from public.jokes where source = 'ai' and rating_count > 0)::int as rated,
             (select count(*) from public.jokes j join public.showdown_joke_stats s on s.joke_id = j.id
               where j.source = 'ai' and s.wins > 0)::int                                     as won`),

    query<Divisive>(`
      select j.id::int, j.setup, j.punchline, j.source, j.category,
             count(*)::int as n, avg(r.rating)::float as avg, stddev_pop(r.rating)::float as sd,
             array[count(*) filter (where r.rating = 1), count(*) filter (where r.rating = 2),
                   count(*) filter (where r.rating = 3), count(*) filter (where r.rating = 4),
                   count(*) filter (where r.rating = 5)]::int[] as dist
        from public.jokes j join public.ratings r on r.joke_id = j.id
       where j.kind = 'text'
       group by j.id having count(*) >= 2
       order by sd desc, n desc limit 3`),

    query<Ranked>(`
      select j.id::int, j.setup, j.punchline, j.source, s.rating::float, s.wins, s.losses
        from public.showdown_joke_stats s join public.jokes j on j.id = s.joke_id
       where s.completed > 0 order by s.rating desc limit 5`),

    query<Ranked>(`
      select j.id::int, j.setup, j.punchline, j.source, s.rating::float, s.wins, s.losses
        from public.showdown_joke_stats s join public.jokes j on j.id = s.joke_id
       where s.completed > 0 order by s.rating asc limit 3`),

    query<Critic>(`
      select p.id, p.first_name, p.last_name, count(*)::int as n, avg(r.rating)::float as avg
        from public.ratings r join public.profiles p on p.id = r.user_id
       group by p.id having count(*) >= 2
       order by avg`),

    query<CategoryRow>(`
      select category,
             count(*) filter (where source = 'human' and kind = 'text')::int as human,
             count(*) filter (where source = 'ai')::int                      as ai,
             count(*) filter (where kind = 'image')::int                     as memes,
             avg(rating_avg)::float                                          as avg_stars
        from public.jokes group by category order by count(*) desc limit 10`),

    query<Topic>(`
      select lower(btrim(prompt)) as topic, count(*)::int as n
        from public.generations where nullif(btrim(prompt), '') is not null
       group by 1 order by 2 desc, 1 limit 8`),

    query<ModelRow>(`select model, count(*)::int as n from public.generations group by 1 order by 2 desc`),
  ]);

  return {
    totals: totals!, sources, h2h: h2h!, stars, heat, days, funnel: funnel!, divisive,
    top, bottom, critics, categories, topics, models,
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
