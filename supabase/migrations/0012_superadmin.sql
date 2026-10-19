-- Superadmins, for the admin panel at /admin.
-- Idempotent: safe to re-run.
--
-- The panel reads this flag on every request and refuses anyone without it.
-- The flag is only as strong as the guarantee that a user cannot set it on
-- themselves, and 0002's "users update their own profile" policy is row-level:
-- it lets a signed-in user update ANY column of their own row, straight from the
-- browser with the publishable key. So the column needs two locks of its own.

alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;

-- ---------- lock 1: column privileges ----------
--
-- Supabase grants table-wide UPDATE to anon and authenticated. Narrow it to the
-- columns the profile form actually writes (app/profile/actions.ts), so a
-- PATCH naming is_superadmin is rejected with a permission error before RLS is
-- even consulted. A column added later is not writable until it is listed here.
revoke update on public.profiles from anon, authenticated;
grant update (first_name, last_name, avatar_path, updated_at)
  on public.profiles to authenticated;

-- ---------- lock 2: a trigger that holds even if a grant drifts ----------
--
-- Only the database owner and the service role (the secret key, used by the
-- site's server) may change the flag.
create or replace function public.profiles_superadmin_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_superadmin is distinct from old.is_superadmin
     and current_user in ('anon', 'authenticated') then
    raise exception 'is_superadmin cannot be changed from a client'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_superadmin_guard on public.profiles;
create trigger profiles_superadmin_guard
  before update on public.profiles
  for each row execute function public.profiles_superadmin_guard();

revoke execute on function public.profiles_superadmin_guard() from public, anon, authenticated;

-- ---------- the one admin ----------
--
-- Matches on the Google account's email in auth.users (profiles deliberately
-- has no email column — see 0002). If that account has never signed in there
-- is no row yet and this updates nothing; sign in once, then run
-- `npm run grant-admin -- <email>`.
update public.profiles p
set is_superadmin = true
from auth.users u
where u.id = p.id
  and lower(u.email) = 'sr4370@columbia.edu';
