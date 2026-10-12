-- Showdown: two written jokes, no names, pick the funnier one.
-- Idempotent: safe to re-run.
--
-- The whole game runs through three security-definer functions rather than
-- table policies, for the same reason 0007 kept the joke text in the ledger: a
-- Server Action is a POST endpoint anyone with a session can replay. If the
-- client could insert a match it could choose its own pair, and if it could
-- update one it could vote twice. So the tables below have no insert, update or
-- delete policy at all, and the functions are the only way in:
--
--   showdown_next_match()   issues a pair (or hands back the open one)
--   showdown_vote()         completes it, once, and moves the aggregates
--   showdown_rebuild_stats() recomputes the aggregates from the event log
--
-- The pre-vote shape is the other half of the design. showdown_next_match
-- returns ids, setups and punchlines and nothing else — no source, author,
-- model, prompt or rating — so the blind part of the screen is blind by
-- construction rather than by the client choosing not to render a field. (The
-- /jokes feed still shows provenance, so someone with a long memory can
-- recognise a joke. The promise is a blind Showdown, not a secret corpus.)

-- ---------- the event log ----------
--
-- One row per pair issued to one voter. It is the authorization token for the
-- vote — showdown_vote only accepts a winner for a row issued to the caller —
-- and the source of truth the aggregates are rebuilt from, so it is never
-- pruned and a completed row is never edited.
--
-- `on delete cascade` on every joke reference: a deleted joke takes its matches
-- with it. Its opponents' aggregates then run one match ahead of the log until
-- the next showdown_rebuild_stats(), which is the price of not keeping
-- tombstones for content that is meant to be gone.
create table if not exists public.showdown_matches (
  id             bigint      generated always as identity primary key,
  voter_id       uuid        not null references public.profiles(id) on delete cascade,
  left_joke_id   bigint      not null references public.jokes(id) on delete cascade,
  right_joke_id  bigint      not null references public.jokes(id) on delete cascade,
  winner_joke_id bigint      references public.jokes(id) on delete cascade,
  created_at     timestamptz not null default now(),
  voted_at       timestamptz
);

-- Separate statements, for the reason 0005 gives.
alter table public.showdown_matches drop constraint if exists showdown_matches_distinct_check;
alter table public.showdown_matches add constraint showdown_matches_distinct_check
  check (left_joke_id <> right_joke_id);

alter table public.showdown_matches drop constraint if exists showdown_matches_winner_check;
alter table public.showdown_matches add constraint showdown_matches_winner_check
  check (winner_joke_id is null or winner_joke_id in (left_joke_id, right_joke_id));

-- A vote is the winner and the moment together. Half of one is a bug.
alter table public.showdown_matches drop constraint if exists showdown_matches_vote_check;
alter table public.showdown_matches add constraint showdown_matches_vote_check
  check ((winner_joke_id is null) = (voted_at is null));

-- No unique constraint on the unordered pair, on purpose. An endless mode will
-- eventually have to show someone a pairing again; avoiding repeats is the
-- matchmaker's job, not a constraint that would one day make the game stop.

-- Recent-history filtering and the "is there an open match" lookup.
create index if not exists showdown_matches_voter_created_idx
  on public.showdown_matches (voter_id, created_at desc);

-- Per-joke history and the aggregate rebuild.
create index if not exists showdown_matches_left_idx   on public.showdown_matches (left_joke_id);
create index if not exists showdown_matches_right_idx  on public.showdown_matches (right_joke_id);
create index if not exists showdown_matches_winner_idx on public.showdown_matches (winner_joke_id);

-- Leaderboards only ever read completed matches; abandoned ones are noise there.
create index if not exists showdown_matches_completed_idx
  on public.showdown_matches (voted_at)
  where voted_at is not null;

-- ---------- a decided match stays decided ----------
--
-- No client can update this table (no policy), so this is aimed at the
-- functions below and at anyone holding the secret key: the only legal update
-- is the one that records the vote, and only while there is not one already.
-- Without it, a bug in showdown_vote — or a hand-run UPDATE — could quietly
-- rewrite history the aggregates were built from.
create or replace function public.showdown_matches_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.voted_at is not null then
    raise exception 'showdown match % is already decided', old.id
      using errcode = 'check_violation';
  end if;

  if new.voter_id      is distinct from old.voter_id
  or new.left_joke_id  is distinct from old.left_joke_id
  or new.right_joke_id is distinct from old.right_joke_id
  or new.created_at    is distinct from old.created_at then
    raise exception 'only the vote on showdown match % can change', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists showdown_matches_guard on public.showdown_matches;
create trigger showdown_matches_guard
  before update on public.showdown_matches
  for each row execute function public.showdown_matches_guard();

-- ---------- matches RLS ----------
alter table public.showdown_matches enable row level security;

-- Your own matches only. Everyone else's is who voted for what, which is
-- exactly what a leaderboard must never expose.
drop policy if exists "voters read their own matches" on public.showdown_matches;
create policy "voters read their own matches"
  on public.showdown_matches for select to authenticated
  using (auth.uid() = voter_id);

-- No insert, update or delete policy: see the header.

-- ---------- per-joke aggregates ----------
--
-- A cache over showdown_matches, kept so a leaderboard is one indexed read
-- rather than a scan of every vote ever cast. showdown_vote keeps it current;
-- showdown_rebuild_stats() throws it away and recomputes it, which is what makes
-- it safe to change the scoring formula later.
create table if not exists public.showdown_joke_stats (
  joke_id         bigint      primary key references public.jokes(id) on delete cascade,
  -- Times issued, including matches nobody voted on. This is what the
  -- matchmaker balances on, so a joke that keeps getting skipped still counts
  -- as having had its turn.
  appearances     integer     not null default 0,
  wins            integer     not null default 0,
  losses          integer     not null default 0,
  wins_vs_human   integer     not null default 0,
  losses_vs_human integer     not null default 0,
  wins_vs_ai      integer     not null default 0,
  losses_vs_ai    integer     not null default 0,
  -- Generated so the leaderboard can filter on it through PostgREST.
  completed       integer     generated always as (wins + losses) stored,
  -- showdown_wilson(wins, completed), cached. See below.
  score           double precision not null default 0,
  updated_at      timestamptz not null default now()
);

create index if not exists showdown_joke_stats_score_idx
  on public.showdown_joke_stats (score desc);

alter table public.showdown_joke_stats enable row level security;

-- Aggregates only: counts per joke, never a voter. Readable once signed in, on
-- the same footing as `ratings` since 0004.
drop policy if exists "showdown stats are readable once signed in" on public.showdown_joke_stats;
create policy "showdown stats are readable once signed in"
  on public.showdown_joke_stats for select to authenticated
  using (true);

-- ---------- the score ----------
--
-- The lower bound of the 95% Wilson interval on the win rate: "the lowest win
-- rate this record still plausibly supports". Raw win rate would put a joke at
-- 1–0 above one at 180–40; this puts 1–0 at about 0.21 and 180–40 at about 0.76,
-- and the two converge as the evidence piles up.
create or replace function public.showdown_wilson(wins integer, total integer)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case
    when total is null or total <= 0 then 0::double precision
    else (
      p + z * z / (2 * n)
      - z * sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    ) / (1 + z * z / n)
  end
  from (select wins::double precision / total as p,
               total::double precision         as n,
               1.959964::double precision      as z) as v;
$$;

-- ---------- who may play ----------
--
-- Mirrors isProfileComplete() in lib/auth.ts. The page checks it too; this is
-- the copy a direct RPC call cannot step around.
create or replace function public.showdown_profile_ready(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and nullif(btrim(p.first_name), '') is not null
      and nullif(btrim(p.last_name),  '') is not null
  );
$$;

-- ---------- issuing a pair ----------
--
-- Returns the caller's open match if one exists, otherwise picks and records a
-- new one. Handing the open match back is deliberate: a reload must not reroll
-- the pair, or anyone could refresh until their own favourite came up — and a
-- reroll would also count an appearance for two jokes nobody judged. The only
-- ways past a pair are voting on it or letting it expire.
--
-- Returns no rows when fewer than two jokes are eligible.
create or replace function public.showdown_next_match()
returns table (
  match_id        bigint,
  left_id         bigint,
  left_setup      text,
  left_punchline  text,
  right_id        bigint,
  right_setup     text,
  right_punchline text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- How long an issued pair stays votable. Matches showdown_vote.
  match_ttl  constant interval := interval '30 minutes';
  -- Each step relaxes the history filter until something is left to show:
  -- jokes seen in the last N matches, then pairs seen in the last M. The last
  -- step forgets history entirely, so a tiny corpus repeats rather than ends.
  joke_windows constant integer[] := array[50, 10, 0, 0];
  pair_windows constant integer[] := array[500, 500, 500, 0];
  -- How many candidates are drawn before pairing them up. Pairing is a self
  -- join, so this caps it at 780 pairs however large the table gets.
  pool_size  constant integer := 40;

  uid     uuid := auth.uid();
  open_id bigint;
  a_id    bigint;
  b_id    bigint;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.showdown_profile_ready(uid) then
    raise exception 'incomplete_profile' using errcode = '28000';
  end if;

  -- Two tabs loading at once would otherwise both see "no open match" and
  -- both issue one. Per voter, and released at commit.
  perform pg_advisory_xact_lock(hashtext('showdown_next_match'), hashtext(uid::text));

  select m.id into open_id
  from public.showdown_matches m
  where m.voter_id = uid
    and m.voted_at is null
    and m.created_at > now() - match_ttl
  order by m.created_at desc
  limit 1;

  if open_id is null then
    for step in 1 .. array_length(joke_windows, 1) loop
      with history as materialized (
        select m.left_joke_id  as l,
               m.right_joke_id as r,
               row_number() over (order by m.created_at desc) as n
        from public.showdown_matches m
        where m.voter_id = uid
        order by m.created_at desc
        limit 500
      ),
      seen as (
        select h.l as joke_id from history h where h.n <= joke_windows[step]
        union
        select h.r from history h where h.n <= joke_windows[step]
      ),
      -- Weighted sampling without replacement (Efraimidis–Spirakis): each joke
      -- draws random()^(1/w) and the largest keys win. w = 1/(1 + appearances),
      -- so a joke nobody has seen is about ten times likelier to be drawn than
      -- one that has already been shown nine times — new jokes get their turn
      -- without the veterans disappearing.
      --
      -- `materialized` is load-bearing: the pool is read twice below, and an
      -- inlined CTE would roll fresh random numbers for each read.
      pool as materialized (
        select j.id, j.category,
               power(random(), 1 + coalesce(s.appearances, 0)) as k
        from public.jokes j
        left join public.showdown_joke_stats s on s.joke_id = j.id
        where j.kind = 'text'
          -- `distinct from`, not `<>`: the seeded jokes have no author, and
          -- NULL <> uid is NULL, which would quietly exclude all of them.
          and j.author_id is distinct from uid
          and j.id not in (select joke_id from seen)
        order by k desc
        limit pool_size
      )
      select a.id, b.id into a_id, b_id
      from pool a
      join pool b on a.id < b.id
      where not exists (
        select 1 from history h
        where h.n <= pair_windows[step]
          and least(h.l, h.r) = a.id
          and greatest(h.l, h.r) = b.id
      )
      -- Same category first, so a pun is not judged against a programming
      -- joke when a fairer fight is available.
      order by (a.category = b.category) desc, a.k + b.k desc
      limit 1;

      exit when a_id is not null;
    end loop;

    if a_id is null then
      return;  -- fewer than two eligible jokes
    end if;

    -- a_id < b_id by construction, so without this the lower id would always
    -- sit on the left.
    insert into public.showdown_matches (voter_id, left_joke_id, right_joke_id)
    select uid,
           case when flip then b_id else a_id end,
           case when flip then a_id else b_id end
    from (select random() < 0.5 as flip) as coin
    returning id into open_id;

    insert into public.showdown_joke_stats as s (joke_id, appearances)
    values (a_id, 1), (b_id, 1)
    on conflict (joke_id) do update
      set appearances = s.appearances + 1,
          updated_at  = now();
  end if;

  -- The whole pre-vote payload. Adding a column here un-blinds the game.
  return query
  select m.id, l.id, l.setup, l.punchline, r.id, r.setup, r.punchline
  from public.showdown_matches m
  join public.jokes l on l.id = m.left_joke_id
  join public.jokes r on r.id = m.right_joke_id
  where m.id = open_id;
end;
$$;

-- ---------- casting a vote ----------
--
-- One conditional UPDATE does the deciding: it only matches a row that is the
-- caller's, still open, unexpired, old enough to have been read, and names one
-- of its own two jokes as the winner. Two concurrent submissions both try it;
-- the row lock makes the second re-check `voted_at is null` after the first
-- commits, so exactly one of them lands. Everything after it — the aggregates
-- — is in the same transaction, so a vote and its effect on the leaderboard
-- cannot come apart.
--
-- Returns one row. `status` is 'ok' or a reason; the sources are filled in for
-- 'ok' and 'already_voted' (a replayed double-click gets the same reveal back).
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

  update public.showdown_joke_stats s
  set score = public.showdown_wilson(s.wins, s.wins + s.losses)
  where s.joke_id in (m.winner_joke_id, loser);

  return query
  select 'ok'::text, m.left_joke_id, l_src, m.right_joke_id, r_src, m.winner_joke_id;
end;
$$;

-- ---------- rebuilding the aggregates ----------
--
-- Recomputes showdown_joke_stats from the event log alone. Run it after
-- changing showdown_wilson, after deleting jokes (see the cascade note above),
-- or whenever the cache is suspected of drifting:
--
--   select public.showdown_rebuild_stats();
--
-- Admin only — execute is revoked from every client role below.
create or replace function public.showdown_rebuild_stats()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Hold votes off while the table is empty, or one landing mid-rebuild would
  -- be counted by its upsert and then lost to the reinsert.
  lock table public.showdown_matches in share mode;
  lock table public.showdown_joke_stats in exclusive mode;

  delete from public.showdown_joke_stats;

  insert into public.showdown_joke_stats (
    joke_id, appearances, wins, losses,
    wins_vs_human, losses_vs_human, wins_vs_ai, losses_vs_ai, score
  )
  select t.joke_id, t.appearances, t.wins, t.losses,
         t.wins_vs_human, t.losses_vs_human, t.wins_vs_ai, t.losses_vs_ai,
         public.showdown_wilson(t.wins, t.wins + t.losses)
  from (
    select side.mine as joke_id,
           count(*)::int                                                                as appearances,
           count(*) filter (where m.winner_joke_id = side.mine)::int                    as wins,
           count(*) filter (where m.winner_joke_id = side.theirs)::int                  as losses,
           count(*) filter (where m.winner_joke_id = side.mine   and o.source = 'human')::int as wins_vs_human,
           count(*) filter (where m.winner_joke_id = side.theirs and o.source = 'human')::int as losses_vs_human,
           count(*) filter (where m.winner_joke_id = side.mine   and o.source = 'ai')::int    as wins_vs_ai,
           count(*) filter (where m.winner_joke_id = side.theirs and o.source = 'ai')::int    as losses_vs_ai
    from public.showdown_matches m
    cross join lateral (values (m.left_joke_id,  m.right_joke_id),
                               (m.right_joke_id, m.left_joke_id)) as side(mine, theirs)
    join public.jokes o on o.id = side.theirs
    group by side.mine
  ) as t;
end;
$$;

-- ---------- human leaderboards ----------
--
-- Built from the event log rather than the per-joke cache, because it needs
-- something the cache deliberately does not keep: how many different people
-- voted. That is also why it is security definer — matches are readable only
-- by their own voter — and why it returns counts and never a voter id.
--
-- Only `source = 'human'` jokes with an author count. An AI joke's author_id is
-- whoever pressed Generate; crediting them here would let a prompt pass as a
-- joke written. p_vs_ai narrows it to matches against AI jokes ("AI slayers").
-- The thresholds are parameters so they live in one place (lib/showdown.ts) and
-- can move with participation without a migration.
create or replace function public.showdown_human_leaderboard(
  p_vs_ai       boolean,
  p_min_jokes   integer,
  p_min_matches integer,
  p_min_voters  integer,
  p_limit       integer default 50
)
returns table (
  author_id   uuid,
  first_name  text,
  last_name   text,
  avatar_path text,
  jokes       integer,
  wins        integer,
  losses      integer,
  voters      integer,
  score       double precision,
  qualified   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with sides as (
    select j.author_id,
           j.id     as joke_id,
           m.voter_id,
           m.winner_joke_id = j.id as won
    from public.showdown_matches m
    cross join lateral (values (m.left_joke_id,  m.right_joke_id),
                               (m.right_joke_id, m.left_joke_id)) as side(mine, theirs)
    join public.jokes j on j.id = side.mine
    join public.jokes o on o.id = side.theirs
    where m.voted_at is not null
      and j.source = 'human'
      and j.author_id is not null
      -- Belt and braces: the matchmaker never shows you your own joke.
      and m.voter_id <> j.author_id
      and (not p_vs_ai or o.source = 'ai')
  ),
  totals as (
    select s.author_id,
           count(distinct s.joke_id)::int       as jokes,
           count(*) filter (where s.won)::int     as wins,
           count(*) filter (where not s.won)::int as losses,
           count(distinct s.voter_id)::int      as voters
    from sides s
    group by s.author_id
  )
  select t.author_id, p.first_name, p.last_name, p.avatar_path,
         t.jokes, t.wins, t.losses, t.voters,
         public.showdown_wilson(t.wins, t.wins + t.losses) as score,
         (t.jokes >= p_min_jokes
          and t.wins + t.losses >= p_min_matches
          and t.voters >= p_min_voters) as qualified
  from totals t
  join public.profiles p on p.id = t.author_id
  order by qualified desc, score desc, t.wins + t.losses desc
  limit greatest(1, least(p_limit, 200));
$$;

-- ---------- who can call what ----------
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase adds
-- anon and authenticated on top, so each of these starts closed and is opened
-- deliberately.
revoke execute on function public.showdown_matches_guard()      from public, anon, authenticated;
revoke execute on function public.showdown_profile_ready(uuid)  from public, anon, authenticated;
revoke execute on function public.showdown_rebuild_stats()      from public, anon, authenticated;
revoke execute on function public.showdown_next_match()         from public, anon;
revoke execute on function public.showdown_vote(bigint, bigint) from public, anon;
revoke execute on function public.showdown_human_leaderboard(boolean, integer, integer, integer, integer)
  from public, anon;

grant execute on function public.showdown_next_match()         to authenticated;
grant execute on function public.showdown_vote(bigint, bigint) to authenticated;
grant execute on function public.showdown_human_leaderboard(boolean, integer, integer, integer, integer)
  to authenticated;
-- Pure arithmetic, and the leaderboard page explains the score with it.
grant execute on function public.showdown_wilson(integer, integer) to authenticated;
