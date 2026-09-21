-- Jokes table for the list page.
-- Idempotent: safe to re-run.

create table if not exists public.jokes (
  id         bigint generated always as identity primary key,
  setup      text        not null,
  punchline  text        not null,
  category   text        not null,
  rating     smallint    not null default 3 check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

-- RLS is what makes this table readable from the browser.
--
-- Supabase enables RLS with a deny-all default. Without the policy below, the
-- publishable key returns an empty array with NO error: the page renders blank
-- in Incognito while still looking fine over DATABASE_URL, which bypasses RLS.
alter table public.jokes enable row level security;

drop policy if exists "jokes are publicly readable" on public.jokes;
create policy "jokes are publicly readable"
  on public.jokes
  for select
  to anon, authenticated
  using (true);

-- Read-only to the public: no insert/update/delete policy exists, so writes are
-- rejected for anon even though reads are open.

insert into public.jokes (setup, punchline, category, rating)
select * from (values
  ('Why do programmers prefer dark mode?', 'Because light attracts bugs.', 'Programming', 5::smallint),
  ('There are only 10 kinds of people in this world.', 'Those who understand binary and those who do not.', 'Programming', 5::smallint),
  ('How many programmers does it take to change a light bulb?', 'None. That is a hardware problem.', 'Programming', 4::smallint),
  ('Why do Java developers wear glasses?', 'Because they cannot C#.', 'Programming', 3::smallint),
  ('A SQL query walks into a bar, sees two tables and asks:', 'May I join you?', 'Programming', 4::smallint),
  ('I am reading a book on anti-gravity.', 'It is impossible to put down.', 'Dad joke', 4::smallint),
  ('What did the ocean say to the beach?', 'Nothing. It just waved.', 'Dad joke', 3::smallint),
  ('What do you call a fake noodle?', 'An impasta.', 'Dad joke', 3::smallint),
  ('I used to be a banker.', 'But I lost interest.', 'Pun', 4::smallint),
  ('Why did the scarecrow win an award?', 'He was outstanding in his field.', 'Pun', 4::smallint),
  ('Never trust an atom.', 'They make up everything.', 'Science', 5::smallint),
  ('Why can you not trust stairs?', 'They are always up to something.', 'Science', 3::smallint)
) as seed(setup, punchline, category, rating)
where not exists (select 1 from public.jokes);
