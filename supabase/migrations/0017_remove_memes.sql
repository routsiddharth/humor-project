-- The site is text jokes only. This undoes 0005 and 0006: the meme rows go,
-- and with them the columns and constraints that existed to hold a picture.
--
-- The image files in the `memes` bucket are not touched here. Supabase refuses
-- direct deletes from storage.objects, so they (and the bucket) are removed
-- through the Storage API before this runs.
--
-- `kind` stays, pinned to 'text': showdown_next_match (0009), the generate
-- flow and the admin pipeline still filter on it, and dropping it would break
-- them for no gain. Idempotent: safe to re-run.

-- Ratings, Showdown matches and Showdown stats all reference jokes with
-- ON DELETE CASCADE, so they go with the rows.
delete from public.jokes where kind <> 'text';

alter table public.jokes drop constraint if exists jokes_payload_check;
alter table public.jokes drop constraint if exists jokes_ai_is_text_check;
alter table public.jokes drop constraint if exists jokes_kind_check;

alter table public.jokes
  drop column if exists image_path,
  drop column if exists image_alt,
  drop column if exists image_width,
  drop column if exists image_height;

alter table public.jokes add constraint jokes_kind_check check (kind = 'text');

-- 0005 and 0006 relaxed these so a meme could leave them empty.
alter table public.jokes alter column setup set not null;
alter table public.jokes alter column punchline set not null;

-- Every row has the same kind now, so it does nothing for the index.
drop index if exists public.jokes_kind_category_idx;
create index if not exists jokes_category_idx on public.jokes (category);
