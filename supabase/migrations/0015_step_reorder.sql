-- Reordering steps from the chain page. Idempotent: safe to re-run.
--
-- Moving a step up swaps its position with its neighbour's in one UPDATE. A
-- plain unique constraint is checked row by row, so the first row of the swap
-- collides with the second; DEFERRABLE INITIALLY IMMEDIATE checks it at the end
-- of the statement instead, when the two positions have traded places. Every
-- other write still sees it as an ordinary unique constraint.
--
-- Note for anyone re-running 0013 on a fresh database after this: its seed's
-- `on conflict (chain_id, position)` cannot target a deferrable constraint, so
-- 0013 must run before this, which the migration order already guarantees.

alter table public.prompt_chain_steps drop constraint if exists prompt_chain_steps_chain_id_position_key;
alter table public.prompt_chain_steps add constraint prompt_chain_steps_chain_id_position_key
  unique (chain_id, position) deferrable initially immediate;
