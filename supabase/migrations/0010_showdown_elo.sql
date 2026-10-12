-- Showdown scores become Elo ratings.
-- Idempotent: safe to re-run.
--
-- 0009 ranked jokes by a Wilson lower bound on their win rate, which counts a
-- win over the best joke on the board the same as a win over the worst. Elo
-- does not: every joke starts at 1000, and each vote moves points from the
-- loser to the winner — more of them when the winner was the underdog.
--
-- The trade-off is that Elo depends on the order votes arrived in, so
-- showdown_rebuild_stats() now replays the match log in vote order instead of
-- summing it.
--
-- Also drops the human leaderboards (Top humans, AI slayers), which the app no
-- longer shows.

-- ---------- the rating ----------
alter table public.showdown_joke_stats
  add column if not exists rating double precision not null default 1000;

drop index if exists public.showdown_joke_stats_score_idx;
alter table public.showdown_joke_stats drop column if exists score;

create index if not exists showdown_joke_stats_rating_idx
  on public.showdown_joke_stats (rating desc);

-- ---------- the formula ----------
--
-- Points the winner gains (and the loser gives up):
--
--   expected = 1 / (1 + 10 ^ ((loser - winner) / 400))
--   delta    = k * (1 - expected)
--
-- Two jokes at 1000 trade 16 points. A 1200 beating an 1000 gains about 8; the
-- 1000 beating the 1200 gains about 24. k = 32 is the usual club-chess value:
-- big enough that a new joke finds its level in a few dozen matches.
create or replace function public.showdown_elo_delta(winner double precision, loser double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 32 * (1 - 1 / (1 + power(10::double precision, (loser - winner) / 400)));
$$;

-- ---------- casting a vote ----------
--
-- As in 0009, with the Wilson score swapped for the Elo update at the end.
create or replace function public.showdown_vote(p_match_id bigint, p_winner_id bigint)
returns table (
  status       text,
  left_id      bigint,
  left_source  text,
  right_id     bigint,
  right_source text,
  winner_id    bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  match_ttl     constant interval := interval '30 minutes';
  -- From issue to vote. Nobody reads two jokes in less, and the screen holds
  -- the previous reveal for longer than this before showing the next pair, so
  -- an honest click never trips it. A script does.
  min_decision  constant interval := interval '2 seconds';
  -- Votes per rolling minute. Three seconds a vote, reveal included, is
  -- already faster than reading.
  max_per_min   constant integer  := 20;

  uid    uuid := auth.uid();
  m      public.showdown_matches%rowtype;
  loser  bigint;
  l_src  text;
  r_src  text;
  w_rating double precision;
  l_rating double precision;
  delta    double precision;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.showdown_profile_ready(uid) then
    raise exception 'incomplete_profile' using errcode = '28000';
  end if;

  if (select count(*) from public.showdown_matches x
      where x.voter_id = uid and x.voted_at > now() - interval '1 minute') >= max_per_min then
    return query select 'rate_limited'::text, null::bigint, null::text, null::bigint, null::text, null::bigint;
    return;
  end if;

  update public.showdown_matches x
  set winner_joke_id = p_winner_id,
      voted_at       = now()
  where x.id = p_match_id
    and x.voter_id = uid
    and x.voted_at is null
    and x.created_at >  now() - match_ttl
    and x.created_at <= now() - min_decision
    and p_winner_id in (x.left_joke_id, x.right_joke_id)
    -- Rechecked, not assumed: a joke can change hands or the matchmaker can
    -- have a bug, and a self-vote is the one thing the leaderboards must not
    -- contain.
    and not exists (
      select 1 from public.jokes j
      where j.id in (x.left_joke_id, x.right_joke_id) and j.author_id = uid
    )
  returning x.* into m;

  if not found then
    select x.* into m
    from public.showdown_matches x
    where x.id = p_match_id and x.voter_id = uid;

    -- Someone else's match reads exactly like a missing one.
    if not found then
      return query select 'not_found'::text, null::bigint, null::text, null::bigint, null::text, null::bigint;
    elsif m.voted_at is not null then
      return query
      select 'already_voted'::text, m.left_joke_id, l.source, m.right_joke_id, r.source, m.winner_joke_id
      from public.jokes l, public.jokes r
      where l.id = m.left_joke_id and r.id = m.right_joke_id;
    elsif m.created_at <= now() - match_ttl then
      return query select 'expired'::text, null::bigint, null::text, null::bigint, null::text, null::bigint;
    elsif p_winner_id is null or p_winner_id not in (m.left_joke_id, m.right_joke_id) then
      return query select 'invalid_winner'::text, null::bigint, null::text, null::bigint, null::text, null::bigint;
    elsif m.created_at > now() - min_decision then
      return query select 'too_fast'::text, null::bigint, null::text, null::bigint, null::text, null::bigint;
    else
      -- The only condition left is authorship.
      return query select 'not_found'::text, null::bigint, null::text, null::bigint, null::text, null::bigint;
    end if;
    return;
  end if;

  select j.source into l_src from public.jokes j where j.id = m.left_joke_id;
  select j.source into r_src from public.jokes j where j.id = m.right_joke_id;

  loser := case when m.winner_joke_id = m.left_joke_id then m.right_joke_id else m.left_joke_id end;

  -- Upserts rather than updates: showdown_next_match creates both rows, but a
  -- rebuild racing a vote, or a hand-cleared table, must not lose the result.
  insert into public.showdown_joke_stats as s
    (joke_id, wins, wins_vs_human, wins_vs_ai)
  values (
    m.winner_joke_id, 1,
    (case when loser = m.left_joke_id then l_src else r_src end = 'human')::int,
    (case when loser = m.left_joke_id then l_src else r_src end = 'ai')::int
  )
  on conflict (joke_id) do update
    set wins          = s.wins + 1,
        wins_vs_human = s.wins_vs_human + excluded.wins_vs_human,
        wins_vs_ai    = s.wins_vs_ai    + excluded.wins_vs_ai,
        updated_at    = now();

  insert into public.showdown_joke_stats as s
    (joke_id, losses, losses_vs_human, losses_vs_ai)
  values (
    loser, 1,
    (case when m.winner_joke_id = m.left_joke_id then l_src else r_src end = 'human')::int,
    (case when m.winner_joke_id = m.left_joke_id then l_src else r_src end = 'ai')::int
  )
  on conflict (joke_id) do update
    set losses          = s.losses + 1,
        losses_vs_human = s.losses_vs_human + excluded.losses_vs_human,
        losses_vs_ai    = s.losses_vs_ai    + excluded.losses_vs_ai,
        updated_at      = now();

  -- Elo. The winner takes k * (1 - expected) points from the loser, where
  -- `expected` is how likely the winner was to win going in: beating a
  -- stronger joke is worth more than beating a weaker one. `for update` holds
  -- both rows so two votes landing at once cannot read the same old ratings.
  select s.rating into w_rating from public.showdown_joke_stats s
  where s.joke_id = m.winner_joke_id for update;
  select s.rating into l_rating from public.showdown_joke_stats s
  where s.joke_id = loser for update;

  delta := public.showdown_elo_delta(w_rating, l_rating);

  update public.showdown_joke_stats s
  set rating = case when s.joke_id = m.winner_joke_id then w_rating + delta
                    else l_rating - delta end
  where s.joke_id in (m.winner_joke_id, loser);

  return query
  select 'ok'::text, m.left_joke_id, l_src, m.right_joke_id, r_src, m.winner_joke_id;
end;
$$;

-- ---------- rebuilding the aggregates ----------
--
-- Recomputes showdown_joke_stats from the event log. The counts are a sum, as
-- before; the ratings are replayed one vote at a time in the order they were
-- cast, because that order is part of what Elo means.
--
--   select public.showdown_rebuild_stats();
create or replace function public.showdown_rebuild_stats()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Not `m`: the insert below aliases showdown_matches as m, and plpgsql
  -- would read that as this variable.
  g       record;
  w       double precision;
  l       double precision;
  delta   double precision;
begin
  -- Hold votes off while the table is empty, or one landing mid-rebuild would
  -- be counted by its upsert and then lost to the reinsert.
  lock table public.showdown_matches in share mode;
  lock table public.showdown_joke_stats in exclusive mode;

  delete from public.showdown_joke_stats;

  insert into public.showdown_joke_stats (
    joke_id, appearances, wins, losses,
    wins_vs_human, losses_vs_human, wins_vs_ai, losses_vs_ai
  )
  select side.mine,
         count(*)::int,
         count(*) filter (where m.winner_joke_id = side.mine)::int,
         count(*) filter (where m.winner_joke_id = side.theirs)::int,
         count(*) filter (where m.winner_joke_id = side.mine   and o.source = 'human')::int,
         count(*) filter (where m.winner_joke_id = side.theirs and o.source = 'human')::int,
         count(*) filter (where m.winner_joke_id = side.mine   and o.source = 'ai')::int,
         count(*) filter (where m.winner_joke_id = side.theirs and o.source = 'ai')::int
  from public.showdown_matches m
  cross join lateral (values (m.left_joke_id,  m.right_joke_id),
                             (m.right_joke_id, m.left_joke_id)) as side(mine, theirs)
  join public.jokes o on o.id = side.theirs
  group by side.mine;

  -- Every row starts at the column default (1000); replay from there.
  for g in
    select x.winner_joke_id as winner,
           case when x.winner_joke_id = x.left_joke_id
                then x.right_joke_id else x.left_joke_id end as loser
    from public.showdown_matches x
    where x.voted_at is not null
    order by x.voted_at, x.id
  loop
    select s.rating into w from public.showdown_joke_stats s where s.joke_id = g.winner;
    select s.rating into l from public.showdown_joke_stats s where s.joke_id = g.loser;
    delta := public.showdown_elo_delta(w, l);
    update public.showdown_joke_stats set rating = w + delta where joke_id = g.winner;
    update public.showdown_joke_stats set rating = l - delta where joke_id = g.loser;
  end loop;
end;
$$;

-- Votes cast under 0009 are already in the log. Without this they would all
-- sit at the column default of 1000 instead of the rating they earned.
select public.showdown_rebuild_stats();

-- ---------- retired ----------
drop function if exists public.showdown_human_leaderboard(boolean, integer, integer, integer, integer);
drop function if exists public.showdown_wilson(integer, integer);

-- ---------- who can call what ----------
--
-- Re-stated because create-or-replace keeps grants but a fresh database runs
-- 0009 and this file back to back, and showdown_elo_delta is new.
revoke execute on function public.showdown_elo_delta(double precision, double precision) from public, anon;
grant  execute on function public.showdown_elo_delta(double precision, double precision) to authenticated;
revoke execute on function public.showdown_rebuild_stats()      from public, anon, authenticated;
revoke execute on function public.showdown_vote(bigint, bigint) from public, anon;
grant  execute on function public.showdown_vote(bigint, bigint) to authenticated;
