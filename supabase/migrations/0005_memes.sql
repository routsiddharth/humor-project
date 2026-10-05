-- Image memes alongside the written jokes.
-- Idempotent: safe to re-run.
--
-- One table with a `kind` column rather than a second table. A meme and a joke
-- differ only in how the punchline is carried — they share the category, the
-- author, the ratings trigger and the ordering — so splitting them would mean a
-- second foreign key from ratings and merging two result sets to render one
-- grid.

alter table public.jokes
  add column if not exists kind       text not null default 'text',
  add column if not exists image_path text,   -- object path inside the `memes` bucket
  add column if not exists image_alt  text;   -- optional description, read by screen readers

-- The constraints are separate statements rather than inline on the columns
-- above, because `add column if not exists` is a no-op on a re-run and would
-- take the constraint down with it.
alter table public.jokes drop constraint if exists jokes_kind_check;
alter table public.jokes add constraint jokes_kind_check
  check (kind in ('text', 'image'));

-- An image meme has no written punchline, so the column has to give up NOT NULL.
alter table public.jokes alter column punchline drop not null;

-- Which makes the shape of a row a constraint's job instead of a column's: a
-- written joke carries a punchline and no image, an image meme the reverse.
-- Without this, a bug in the submit action could store a row that renders as
-- neither — a card with nothing behind the reveal.
alter table public.jokes drop constraint if exists jokes_payload_check;
alter table public.jokes add constraint jokes_payload_check check (
  (kind = 'text'  and punchline  is not null and image_path is null) or
  (kind = 'image' and image_path is not null and punchline  is null)
);

-- The list page filters on kind, and on category beside it.
create index if not exists jokes_kind_category_idx on public.jokes (kind, category);

-- ---------- meme storage ----------
--
-- Its own public bucket, on the same arrangement as `avatars`: read straight
-- from the Storage CDN by URL, so no read policy is needed, and written only by
-- a Server Action holding the secret key, which bypasses RLS, so no insert
-- policy either.
--
-- Unlike `avatars` this bucket carries its own limits. They duplicate the
-- checks in the Server Action on purpose: those run first and produce the nice
-- error message, these are the ones that still hold if that code is ever wrong.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memes', 'memes', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
