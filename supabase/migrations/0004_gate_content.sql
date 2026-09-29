-- Put the jokes behind the login.
-- Idempotent: safe to re-run.
--
-- The page-level gate (proxy.ts plus requireCompleteProfile) stops a browser at
-- the door, but on its own it is cosmetic: the publishable key ships inside the
-- client bundle, so anyone could read the whole table straight from the
-- PostgREST endpoint with it. Narrowing the select policies from
-- {anon, authenticated} to {authenticated} is what actually enforces the gate,
-- because Supabase issues the `anon` role to any request with no session.
--
-- DEPLOY ORDER MATTERS. Apply this only AFTER the code that moved the joke list
-- to /jokes is live. The previous build reads jokes anonymously on `/`, and
-- running this first takes the site down until the deploy catches up.

drop policy if exists "jokes are publicly readable" on public.jokes;
drop policy if exists "jokes are readable once signed in" on public.jokes;
create policy "jokes are readable once signed in"
  on public.jokes
  for select
  to authenticated
  using (true);

drop policy if exists "ratings are publicly readable" on public.ratings;
drop policy if exists "ratings are readable once signed in" on public.ratings;
create policy "ratings are readable once signed in"
  on public.ratings
  for select
  to authenticated
  using (true);

-- Profiles go the same way. Nothing anonymous reads them any more: the author
-- embed only runs on /jokes, and the header skips the profile lookup entirely
-- when there is no session.
drop policy if exists "profiles are publicly readable" on public.profiles;
drop policy if exists "profiles are readable once signed in" on public.profiles;
create policy "profiles are readable once signed in"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Avatars stay in a public Storage bucket. They are served to <img> tags by
-- URL, which carries no session, so gating them would need signed URLs — a
-- bigger change than this one, and the paths are unguessable UUID prefixes.
