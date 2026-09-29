-- Profiles, avatars, and user-submitted jokes.
-- Idempotent: safe to re-run.

-- ---------- profiles ----------
--
-- Deliberately NO email column. This table is publicly readable (author names
-- appear next to submitted jokes), and putting email here would let anyone
-- holding the publishable key dump every user's address. The email already
-- lives on auth.users, which is reachable server-side via getUser().
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text,          -- nullable: unset until the user completes onboarding
  last_name   text,          -- nullable
  avatar_path text,          -- object path inside the `avatars` bucket, not the image bytes
  updated_at  timestamptz not null default now()
);

-- ---------- the trigger ----------
--
-- Fires when Supabase Auth creates the user row, i.e. the first time someone
-- signs in. `security definer` is required: the signing-in user has no rights
-- on public.profiles at that moment, so the function runs as its owner.
-- `search_path = ''` is the matching safety belt — with an empty search path a
-- hijacked schema cannot shadow `profiles`, which is why every name below is
-- fully qualified.
--
-- Names are left NULL on purpose. Google does send given_name/family_name, but
-- prefilling them would mean the onboarding prompt never appears for anyone.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed in before the trigger existed.
insert into public.profiles (id)
select u.id
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------- profiles RLS ----------
alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- No insert policy: rows arrive only via the trigger above, never from a client.
drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------- jokes get an author ----------
--
-- References public.profiles rather than auth.users so that PostgREST can see
-- the foreign key and embed the author in a single query. profiles.id is itself
-- FK'd to auth.users, so a real user is still enforced.
alter table public.jokes
  add column if not exists author_id uuid references public.profiles(id) on delete set null;

drop policy if exists "signed-in users can submit jokes" on public.jokes;
create policy "signed-in users can submit jokes"
  on public.jokes
  for insert
  to authenticated
  with check (auth.uid() = author_id);

-- ---------- avatar storage ----------
--
-- Public bucket: avatars are served straight from the Storage CDN, so no read
-- policy is needed. Uploads go through a Server Action using the secret key,
-- which bypasses RLS entirely — hence no insert policy either.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;
