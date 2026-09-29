-- Community ratings. The stars on a card are now the average of what people
-- voted, not a number baked into the joke.
-- Idempotent: safe to re-run.

create table if not exists public.ratings (
  joke_id    bigint      not null references public.jokes(id) on delete cascade,
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  rating     smallint    not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite primary key: one vote per person per joke, and it gives upsert
  -- a conflict target for free.
  primary key (joke_id, user_id)
);

-- The composite PK indexes (joke_id, user_id) left to right, which covers
-- per-joke lookups. "My votes across all jokes" needs the mirror image.
create index if not exists ratings_user_id_idx on public.ratings (user_id);

-- ---------- denormalised aggregates ----------
--
-- Kept on jokes rather than computed per request. PostgREST cannot aggregate
-- inside an embedded select, so the alternative is shipping every vote to the
-- browser to average it there — which would also expose who voted for what.
alter table public.jokes
  add column if not exists rating_avg   numeric(3, 2),
  add column if not exists rating_count integer not null default 0;

create or replace function public.refresh_joke_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- OLD is null on insert, NEW is null on delete.
  target bigint := coalesce(new.joke_id, old.joke_id);
begin
  -- The aggregate has no GROUP BY, so it returns exactly one row even when the
  -- last vote was just deleted: avg is NULL and count is 0. That is the
  -- "no rating, no stars" state.
  update public.jokes j
  set rating_avg   = stats.avg_rating,
      rating_count = stats.votes
  from (
    select avg(r.rating)::numeric(3, 2) as avg_rating,
           count(*)::integer            as votes
    from public.ratings r
    where r.joke_id = target
  ) as stats
  where j.id = target;

  return null;  -- AFTER trigger; return value is ignored.
end;
$$;

-- security definer is load-bearing here. As the invoking user this UPDATE would
-- be filtered by row level security on jokes, where no update policy exists —
-- it would silently touch zero rows and the average would never move.

drop trigger if exists ratings_changed on public.ratings;
create trigger ratings_changed
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_joke_rating();

-- ---------- ratings RLS ----------
alter table public.ratings enable row level security;

-- Readable so the counts are verifiable, but the home page never selects other
-- people's rows: it reads the aggregate off jokes and only its own votes.
drop policy if exists "ratings are publicly readable" on public.ratings;
create policy "ratings are publicly readable"
  on public.ratings for select to anon, authenticated using (true);

drop policy if exists "users cast their own rating" on public.ratings;
create policy "users cast their own rating"
  on public.ratings for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users change their own rating" on public.ratings;
create policy "users change their own rating"
  on public.ratings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users clear their own rating" on public.ratings;
create policy "users clear their own rating"
  on public.ratings for delete to authenticated using (auth.uid() = user_id);

-- ---------- retire the old per-joke rating ----------
--
-- jokes.rating was a fixed number chosen at seed/submit time. It is fully
-- superseded by rating_avg, and leaving a `rating` column beside a `ratings`
-- table invites writing to the wrong one. The seeded values were arbitrary, so
-- nothing meaningful is lost; the 12 seeded jokes simply start out unrated.
alter table public.jokes drop column if exists rating;
