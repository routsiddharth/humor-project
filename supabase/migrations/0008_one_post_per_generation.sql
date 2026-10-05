-- One generation, at most one post.
-- Idempotent: safe to re-run.
--
-- 0007 put the quota on `generations`: a row per call, and no delete policy, so
-- the count only goes up. That caps how often a user can call the model, but on
-- its own it does not cap what reaches the feed. Posting sends a generation id
-- to a Server Action, and a Server Action is a POST endpoint that anyone holding
-- a session can replay — so a single generation could be posted fifty times and
-- the quota would still read as one call. This index is what makes posting
-- idempotent, and it belongs in the database rather than in a "has it already
-- been posted?" check, which two concurrent replays would both pass.
--
-- A plain unique index is enough: Postgres does not treat NULLs as equal, so
-- every human post (generation_id IS NULL, per jokes_provenance_check) coexists
-- happily and only the AI posts are constrained.
create unique index if not exists jokes_generation_id_key
  on public.jokes (generation_id);
