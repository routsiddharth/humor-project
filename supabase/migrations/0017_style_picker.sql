-- A style picker on Generate: the user can name the chain instead of leaving
-- it to the mix. Idempotent: safe to re-run.
--
-- generations.chain_id already says which chain ran. This says whether the
-- user chose it or the mix drew it, so a chain's share of runs (and of good
-- ratings) can be read with the hand-picked ones separated out — a chain
-- people pick on purpose is not the same signal as one the mix handed them.
alter table public.generations
  add column if not exists chain_picked boolean not null default false;
