-- Prompt chains: Generate runs a sequence of model calls instead of one.
-- Idempotent: safe to re-run.
--
-- The feature in one line: a press of Generate picks a prompt chain (weighted by
-- the mix), runs its steps in order — each step's output can be pasted into a
-- later step's prompt — and the last step's answer is the joke. Every call is
-- written to llm_responses, so a post can be traced back through each prompt
-- that produced it.
--
-- Everything here belongs to the joke board. Nothing reads or writes the
-- humor-study database; the names only resemble its tables because the admin
-- assignment lists the same concepts.
--
-- SERVER ONLY. Every table below enables row level security and grants no
-- policy, so the publishable key reads nothing. The site reaches them over the
-- owner pool (lib/db.ts): Generate reads chains to run them, and the admin
-- panel — behind lib/admin/dal.ts — edits them. Prompts are configuration, and
-- the signup lists are an access-control decision, so neither belongs in the
-- browser.
--
-- Audit columns on the editable tables: created_by / updated_by name the
-- admin's profile, set by the panel (auth.uid() is null over the pool, so a
-- default could not fill them).

-- ---------- providers and models ----------
--
-- `slug` is what the code dispatches on (lib/llm.ts). A provider with a slug
-- the code has no adapter for can still be listed; a step that runs on one of
-- its models fails with a readable error rather than silently.
create table if not exists public.llm_providers (
  id         bigint      generated always as identity primary key,
  name       text        not null unique,
  slug       text        not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  updated_by uuid        references public.profiles(id) on delete set null
);

alter table public.llm_providers drop constraint if exists llm_providers_slug_check;
alter table public.llm_providers add constraint llm_providers_slug_check
  check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$');

-- `provider_model_id` is the exact string sent to the provider's API.
-- `is_active` keeps a model out of the capacity fallback (lib/chain.ts) without
-- deleting it — deletion is refused while a step still names the model.
create table if not exists public.llm_models (
  id                   bigint      generated always as identity primary key,
  provider_id          bigint      not null references public.llm_providers(id) on delete restrict,
  name                 text        not null,
  provider_model_id    text        not null,
  supports_temperature boolean     not null default true,
  is_active            boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid        references public.profiles(id) on delete set null,
  updated_by           uuid        references public.profiles(id) on delete set null,
  unique (provider_id, provider_model_id)
);

-- ---------- chains and their steps ----------
create table if not exists public.prompt_chains (
  id          bigint      generated always as identity primary key,
  slug        text        not null unique,
  name        text        not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid        references public.profiles(id) on delete set null,
  updated_by  uuid        references public.profiles(id) on delete set null
);

alter table public.prompt_chains drop constraint if exists prompt_chains_slug_check;
alter table public.prompt_chains add constraint prompt_chains_slug_check
  check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$');

-- Steps run in `position` order. Every step but the last answers in plain text;
-- the last answers with the setup/punchline JSON that becomes the draft. That
-- rule lives in the code rather than in a column, so no chain can be configured
-- into ending on prose.
--
-- Prompts are templates: {{category}}, {{topic}}, {{avoid}}, {{terms}},
-- {{examples}}, and {{stepN}} for the output of an earlier step. The list is in
-- lib/chain.ts, and the admin form refuses a placeholder that is not on it.
create table if not exists public.prompt_chain_steps (
  id            bigint      generated always as identity primary key,
  chain_id      bigint      not null references public.prompt_chains(id) on delete cascade,
  position      smallint    not null,
  name          text        not null,
  model_id      bigint      not null references public.llm_models(id) on delete restrict,
  temperature   numeric(3,2),
  system_prompt text        not null,
  user_prompt   text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid        references public.profiles(id) on delete set null,
  updated_by    uuid        references public.profiles(id) on delete set null,
  unique (chain_id, position)
);

alter table public.prompt_chain_steps drop constraint if exists prompt_chain_steps_position_check;
alter table public.prompt_chain_steps add constraint prompt_chain_steps_position_check
  check (position between 1 and 20);

alter table public.prompt_chain_steps drop constraint if exists prompt_chain_steps_temperature_check;
alter table public.prompt_chain_steps add constraint prompt_chain_steps_temperature_check
  check (temperature is null or temperature between 0 and 2);

-- ---------- the mix ----------
--
-- Which chains Generate may pick, and how often: a chain is chosen with
-- probability weight / sum(weights). Weight 0 switches a chain off without
-- deleting it. One row per chain, created by the trigger below, so the panel
-- only ever reads and updates the mix — there is nothing to add or remove.
create table if not exists public.prompt_chain_mix (
  id         bigint      generated always as identity primary key,
  chain_id   bigint      not null unique references public.prompt_chains(id) on delete cascade,
  weight     integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  updated_by uuid        references public.profiles(id) on delete set null
);

alter table public.prompt_chain_mix drop constraint if exists prompt_chain_mix_weight_check;
alter table public.prompt_chain_mix add constraint prompt_chain_mix_weight_check
  check (weight between 0 and 100);

create or replace function public.prompt_chains_add_mix()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.prompt_chain_mix (chain_id, weight, created_by, updated_by)
  values (new.id, 0, new.created_by, new.created_by)
  on conflict (chain_id) do nothing;
  return new;
end;
$$;

drop trigger if exists prompt_chains_add_mix on public.prompt_chains;
create trigger prompt_chains_add_mix
  after insert on public.prompt_chains
  for each row execute function public.prompt_chains_add_mix();

revoke execute on function public.prompt_chains_add_mix() from public, anon, authenticated;

-- ---------- what prompts can draw on ----------
--
-- {{terms}}: comedic techniques, highest priority first.
create table if not exists public.terms (
  id         bigint      generated always as identity primary key,
  term       text        not null unique,
  definition text        not null,
  example    text,
  priority   smallint    not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  updated_by uuid        references public.profiles(id) on delete set null
);

-- {{examples}}: few-shot jokes. A NULL category is offered for every category;
-- a named one only when Generate is asked for that category (case-insensitive).
create table if not exists public.generation_examples (
  id         bigint      generated always as identity primary key,
  category   text,
  setup      text        not null,
  punchline  text        not null,
  note       text,       -- why it works, shown to the model beside the joke
  priority   smallint    not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  updated_by uuid        references public.profiles(id) on delete set null
);

-- ---------- generation requests ----------
--
-- `generations` (0007) already has a row per successful press of Generate, and
-- stays the quota and integrity record it was. It now also says which chain ran.
-- `set null`, as jokes.generation_id is: deleting a chain must not erase the
-- history of what it produced.
alter table public.generations
  add column if not exists chain_id bigint references public.prompt_chains(id) on delete set null;

-- ---------- llm responses ----------
--
-- One row per model call. The prompts are stored as rendered — placeholders
-- filled — so a trace still reads correctly after the step that produced it is
-- edited or deleted; step_id and model_id are links, not the record.
create table if not exists public.llm_responses (
  id            bigint      generated always as identity primary key,
  generation_id bigint      not null references public.generations(id) on delete cascade,
  chain_id      bigint      references public.prompt_chains(id) on delete set null,
  step_id       bigint      references public.prompt_chain_steps(id) on delete set null,
  model_id      bigint      references public.llm_models(id) on delete set null,
  position      smallint    not null,
  step_name     text        not null,
  model         text        not null,   -- the model that actually answered
  temperature   numeric(3,2),
  system_prompt text        not null,
  user_prompt   text        not null,
  response      text        not null,
  duration_ms   integer     not null,
  created_at    timestamptz not null default now(),
  unique (generation_id, position)
);

create index if not exists llm_responses_created_idx on public.llm_responses (created_at desc);
create index if not exists llm_responses_step_idx on public.llm_responses (step_id);

-- ---------- who may sign in ----------
--
-- Checked in app/auth/callback after Google returns. Both lists empty means the
-- board is open to any Google account, which is how it has always run; once a
-- domain is listed, only that domain (or a subdomain of it) and the whitelisted
-- addresses get in. Superadmins are always let in, so the panel cannot be used
-- to lock its own admin out.
create table if not exists public.allowed_signup_domains (
  id         bigint      generated always as identity primary key,
  domain     text        not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  updated_by uuid        references public.profiles(id) on delete set null
);

alter table public.allowed_signup_domains drop constraint if exists allowed_signup_domains_domain_check;
alter table public.allowed_signup_domains add constraint allowed_signup_domains_domain_check
  check (domain = lower(domain) and domain !~ '[@/\s]');

create table if not exists public.whitelisted_emails (
  id         bigint      generated always as identity primary key,
  email      text        not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  updated_by uuid        references public.profiles(id) on delete set null
);

alter table public.whitelisted_emails drop constraint if exists whitelisted_emails_email_check;
alter table public.whitelisted_emails add constraint whitelisted_emails_email_check
  check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ---------- RLS: on, with no policies ----------
alter table public.llm_providers          enable row level security;
alter table public.llm_models             enable row level security;
alter table public.prompt_chains          enable row level security;
alter table public.prompt_chain_steps     enable row level security;
alter table public.prompt_chain_mix       enable row level security;
alter table public.terms                  enable row level security;
alter table public.generation_examples    enable row level security;
alter table public.llm_responses          enable row level security;
alter table public.allowed_signup_domains enable row level security;
alter table public.whitelisted_emails     enable row level security;

-- ---------- seed ----------
--
-- The two Gemini models lib/gemini.ts used to hard-code, in the same preference
-- order, and two chains: the three-step chain that is switched on, and the old
-- single prompt kept at weight 0 so it can be compared by switching it back on.
insert into public.llm_providers (name, slug)
values ('Google', 'google')
on conflict (slug) do nothing;

insert into public.llm_models (provider_id, name, provider_model_id)
select p.id, m.name, m.provider_model_id
from public.llm_providers p,
     (values ('Gemini 3.8 Flash', 'gemini-3.8-flash'),
             ('Gemini 3.1 Flash Lite', 'gemini-3.1-flash-lite')) as m(name, provider_model_id)
where p.slug = 'google'
on conflict (provider_id, provider_model_id) do nothing;

insert into public.prompt_chains (slug, name, description)
values
  ('angle-draft-edit', 'Angle → draft → edit',
   'Brainstorms unusual angles, drafts three jokes from the strongest, then an editor picks one and tightens it.'),
  ('one-shot', 'One shot',
   'The original single prompt: one call straight to a setup and punchline. Kept for comparison.')
on conflict (slug) do nothing;

-- Only on the first run: after that the mix is the admin's to change.
update public.prompt_chain_mix x set weight = 1
from public.prompt_chains c
where c.id = x.chain_id and c.slug = 'angle-draft-edit'
  and not exists (select 1 from public.prompt_chain_mix where weight > 0);

insert into public.prompt_chain_steps (chain_id, position, name, model_id, temperature, system_prompt, user_prompt)
select c.id, s.position, s.name, m.id, s.temperature, s.system_prompt, s.user_prompt
from public.prompt_chains c
join (values
  ('angle-draft-edit', 1::smallint, 'Find angles', 1.0::numeric,
   $p$You brainstorm premises for short two-part jokes. You do not write the jokes themselves. Answer with a numbered list and nothing else.$p$,
   $p$Category: {{category}}
Topic: {{topic}}

Techniques you can lean on:
{{terms}}

List six distinct, specific angles a joke here could take: an odd observation, a double meaning, a mismatch of scale, a familiar situation seen from the wrong side. One line each. Skip any angle the usual jokes in this category already use.

Already posted (do not build on these):
{{avoid}}$p$),
  ('angle-draft-edit', 2::smallint, 'Draft jokes', 0.9::numeric,
   $p$You write short two-part jokes for a joke board. The setup leads the reader one way; the punchline subverts it and lands on its own, with no explanation after it. No preamble, no emoji, no hashtags.$p$,
   $p$Angles:
{{step1}}

Jokes that work, for the register:
{{examples}}

Pick the three strongest angles and write one joke for each, formatted as:
Setup: ...
Punchline: ...$p$),
  ('angle-draft-edit', 3::smallint, 'Pick and tighten', 0.3::numeric,
   $p$You are a ruthless joke editor. You return exactly one joke as a setup and a punchline, each under 280 characters, with no surrounding quotation marks.$p$,
   $p$Category: {{category}}

Drafts:
{{step2}}

Already posted:
{{avoid}}

Choose the draft whose punchline lands hardest and is least like anything already posted. Tighten the wording, cutting every word that does not earn its place, without changing the joke.$p$),
  ('one-shot', 1::smallint, 'Write the joke', null::numeric,
   $p$You write short two-part jokes for a joke board. The setup leads the reader one way; the punchline subverts it and lands on its own, with no explanation after it. No preamble, no commentary, no emoji, no hashtags, no surrounding quotation marks. Keep each line under 280 characters. Avoid the single most famous joke of whatever kind you are asked for — it is already posted. Find the angle nobody uses.$p$,
   $p$Write one joke in the "{{category}}" category.
It should be about: {{topic}}

These setups are already posted. Do not reuse them, rephrase them, or write their punchlines:
{{avoid}}$p$)
) as s(chain_slug, position, name, temperature, system_prompt, user_prompt) on s.chain_slug = c.slug
join public.llm_models m on m.provider_model_id = 'gemini-3.8-flash'
on conflict (chain_id, position) do nothing;

insert into public.terms (term, definition, example, priority)
values
  ('Misdirection', 'The setup points the reader at one reading; the punchline reveals a second one that was there all along.', 'I told my wife she was drawing her eyebrows too high. She looked surprised.', 10),
  ('Double meaning', 'One word or phrase carries two senses, and the joke turns on switching between them.', NULL, 8),
  ('Escalation', 'Each beat raises the stakes past the last until the final one is absurd.', NULL, 6),
  ('Understatement', 'A huge thing described as if it were trivial.', NULL, 5),
  ('Literalism', 'A figure of speech taken exactly at its word.', NULL, 5),
  ('Rule of three', 'Two items set a pattern and the third breaks it.', NULL, 4)
on conflict (term) do nothing;

insert into public.generation_examples (category, setup, punchline, note, priority)
select * from (values
  (null::text, 'I bought a ceiling fan for my office.', 'It hasn''t said a word about my work.', 'Double meaning on "fan"; the punchline is short and does not explain itself.', 5::smallint),
  (null::text, 'My calendar says I have a meeting with myself at three.', 'I''m hoping to get out of it early.', 'Turns a familiar annoyance inward; the setup is plain so the turn is clean.', 4::smallint)
) as e(category, setup, punchline, note, priority)
where not exists (select 1 from public.generation_examples);
