-- Open the reading side of the site to signed-out visitors.
-- Idempotent: safe to re-run.
--
-- Reverses the read half of 0004. Browsing — the joke list, people's pages and
-- the Showdown leaderboard — no longer needs a session; every write still does,
-- because none of the insert/update/delete policies or function grants change.
--
-- `ratings` deliberately stays `to authenticated`. Nothing anonymous needs it
-- (the average and count are cached on jokes), and it is the one table here
-- that ties a person to an individual vote.

drop policy if exists "jokes are readable once signed in" on public.jokes;
drop policy if exists "jokes are publicly readable" on public.jokes;
create policy "jokes are publicly readable"
  on public.jokes
  for select
  to anon, authenticated
  using (true);

-- Bylines and avatars on the list and the people pages: names and an avatar
-- path, nothing else lives in this table.
drop policy if exists "profiles are readable once signed in" on public.profiles;
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- Aggregates only, never a voter (see 0009), so the leaderboard can be public.
drop policy if exists "showdown stats are readable once signed in" on public.showdown_joke_stats;
drop policy if exists "showdown stats are publicly readable" on public.showdown_joke_stats;
create policy "showdown stats are publicly readable"
  on public.showdown_joke_stats
  for select
  to anon, authenticated
  using (true);
