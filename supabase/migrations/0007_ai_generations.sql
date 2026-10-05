-- AI-written jokes, rated by the same stars as everyone else's.
-- Idempotent: safe to re-run.
--
-- The feature in one line: a signed-in user presses Generate, Gemini writes a
-- setup and a punchline, and the result is posted as an ordinary card that the
-- existing ratings carry. Nothing about rating changes — `ratings` keys on
-- jokes.id and refresh_joke_rating (0003) does not care what wrote the row.
--
-- WRITTEN JOKES ONLY, and that is a constraint below rather than a convention.
-- The model writes text, not pictures, and 0006 deliberately took the caption
-- away from a meme: "the words on a meme are part of the picture, so a caption
-- beside it is either a duplicate or an invention". An uploaded image with a
-- generated line next to it reinstates exactly that, so until something
-- composes text into the picture there is no shape an AI meme could honestly be
-- stored in. jokes_ai_is_text_check is what refuses one in the meantime.

-- ---------- provenance on a post ----------
--
-- `source` sits beside `kind` rather than inside it. The two answer different
-- questions — kind is what shape the post is, source is what wrote it — and a
-- third `kind` value would have to restate the payload rules for itself and give
-- `ratings` a second case to carry.
alter table public.jokes
  add column if not exists source text not null default 'human',
  -- What the user typed to steer it, and NULL when they typed nothing: the
  -- button works bare, so this is the topic field's value, not a transcript of
  -- the request. The card reveals it when there is one.
  add column if not exists prompt text,
  add column if not exists model  text;   -- which model answered, e.g. gemini-3.1-flash-lite

-- ---------- the generation ledger ----------
--
-- One row per successful generation, written before the draft reaches the
-- browser. It has two jobs, and the first is why it has to exist: every call
-- costs money, so the number of calls a user has made has to be countable
-- somewhere, and `jokes` cannot answer it — someone who generates fifty times
-- and posts once leaves a single row there.
--
-- The second job is integrity. Posting sends back only this row's id, never the
-- joke text, so the action re-reads what the model actually said instead of
-- trusting a hidden form field. Without that, anyone who can POST to the action
-- could file their own writing under an AI badge.
create table if not exists public.generations (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  prompt     text,       -- as above: NULL when the user steered with nothing
  model      text        not null,
  category   text        not null,
  -- [{ "setup": "...", "punchline": "..." }, ...]. One entry today, an array
  -- because offering a few to choose between is the obvious next turn of this
  -- and an array costs nothing now.
  candidates jsonb       not null,
  created_at timestamptz not null default now()
);

alter table public.generations drop constraint if exists generations_candidates_check;
alter table public.generations add constraint generations_candidates_check
  check (jsonb_typeof(candidates) = 'array' and jsonb_array_length(candidates) > 0);

alter table public.generations drop constraint if exists generations_prompt_length_check;
alter table public.generations add constraint generations_prompt_length_check
  check (prompt is null or length(prompt) <= 280);

-- The rate-limit question is "how many rows for this user since a cutoff",
-- which reads straight off this index.
create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);

-- ---------- generations RLS ----------
alter table public.generations enable row level security;

-- Your own attempts only — this is not a feed. The table holds everything a
-- user generated, including the ones they thought better of posting, and the
-- publishable key would otherwise read all of it.
drop policy if exists "users read their own generations" on public.generations;
create policy "users read their own generations"
  on public.generations for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users log their own generations" on public.generations;
create policy "users log their own generations"
  on public.generations for insert to authenticated
  with check (auth.uid() = user_id);

-- No update and no delete policy, and that absence *is* the quota. A row here is
-- the record that a call was made, so a user who could remove one could reset
-- their own limit; a forged direct INSERT only spends quota faster. It is also
-- what makes the integrity check above hold: the candidate cannot be edited
-- after the fact to launder someone's own writing through the AI badge.
-- Erasing a user's history is a server-side job — the secret key bypasses this.

-- ---------- which generation a post came out of ----------
--
-- `on delete set null`, and not a reason to drop jokes.prompt/model: clearing a
-- user's generation history must not blank the provenance on posts that are
-- already public, so the card's copy is deliberately its own.
alter table public.jokes
  add column if not exists generation_id bigint
    references public.generations(id) on delete set null;

-- ---------- the constraints ----------
--
-- Last, because they name columns from both halves above. Separate statements
-- rather than inline, for the reason 0005 gives: `add column if not exists` is a
-- no-op on a re-run and would take an inline constraint down with it.
alter table public.jokes drop constraint if exists jokes_source_check;
alter table public.jokes add constraint jokes_source_check
  check (source in ('human', 'ai'));

-- An AI post records which model wrote it; a human post has nothing to record.
-- `model` is the required half because it is what the badge reads — `prompt` is
-- genuinely optional, since pressing Generate with the topic box empty is the
-- normal case. generation_id is only required to be *absent* on a human post; an
-- AI post may have lost its ledger row to the `set null` above.
alter table public.jokes drop constraint if exists jokes_provenance_check;
alter table public.jokes add constraint jokes_provenance_check check (
  (source = 'human' and prompt is null and model is null and generation_id is null) or
  (source = 'ai'    and model is not null)
);

-- The scope boundary from the header, enforced rather than remembered. Relax it
-- in a later migration, once an AI meme has a real shape to be stored in.
alter table public.jokes drop constraint if exists jokes_ai_is_text_check;
alter table public.jokes add constraint jokes_ai_is_text_check
  check (source = 'human' or kind = 'text');

-- Belt and braces on the same arrangement as the `memes` bucket limits in 0005:
-- the Server Action checks this first and writes the readable error, this is the
-- one that still holds if that code is ever wrong. 280 matches TEXT_LIMIT in
-- app/submit/actions.ts — keep the two in step.
alter table public.jokes drop constraint if exists jokes_prompt_length_check;
alter table public.jokes add constraint jokes_prompt_length_check
  check (prompt is null or length(prompt) <= 280);

-- /jokes gains a third filter axis. Its own index rather than widening
-- jokes_kind_category_idx: `source` would have to lead to be usable on its own,
-- and that would stop the existing index serving a kind-only filter. Postgres
-- combines the two for source+kind.
create index if not exists jokes_source_idx on public.jokes (source);

-- ---------- what does not change ----------
--
-- No new policy on `jokes`: an AI post is inserted by the Server Action as the
-- signed-in user, so "signed-in users can submit jokes" (auth.uid() =
-- author_id) already covers it, with author_id meaning whoever pressed Generate.
-- `ratings` is untouched — AI posts are rateable through the same three policies
-- and the same trigger from 0003, which is the whole point of putting provenance
-- in a column instead of a second table.
