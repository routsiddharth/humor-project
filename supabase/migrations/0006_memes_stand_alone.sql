-- Memes stand on their own: no setup, no reveal.
-- Idempotent: safe to re-run.
--
-- 0005 gave a meme a caption because `setup` was NOT NULL and every row needed
-- one. That was the column talking, not the format: the words on a meme are
-- part of the picture, so a caption beside it is either a duplicate or an
-- invention. A meme post is now the image and nothing else.

-- Intrinsic pixel size, read off the file header when the image is uploaded.
-- A meme card is now mostly picture, so it needs the shape before the bytes
-- arrive — otherwise every image reflows the grid as it loads.
alter table public.jokes
  add column if not exists image_width  integer,
  add column if not exists image_height integer;

-- Order matters: the column has to accept NULL before the captions can go.
alter table public.jokes alter column setup drop not null;

-- The captions on the existing memes were written to satisfy the old NOT NULL.
-- Nothing is lost that the pictures do not already say.
update public.jokes set setup = null where kind = 'image';

-- A written joke is setup + punchline; a meme is an image. Neither borrows a
-- column from the other.
alter table public.jokes drop constraint if exists jokes_payload_check;
alter table public.jokes add constraint jokes_payload_check check (
  (kind = 'text'  and setup is not null and punchline is not null
                  and image_path is null) or
  (kind = 'image' and image_path is not null
                  and setup is null and punchline is null)
);
