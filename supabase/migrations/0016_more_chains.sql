-- Five more prompt chains, each a different shape of joke-writing, so the mix
-- has something to compare. Idempotent: safe to re-run.
--
-- They run on OpenAI models (Gemini was returning 503s when these were
-- written); Auto still falls back across providers if a model is down. The
-- writers' room deliberately splits its steps across providers.

insert into public.prompt_chains (slug, name, description)
values
  ('misdirection', 'Assumption → reversal → joke',
   'Lists what everyone assumes about the topic, finds where each assumption could be wrong, then builds the joke on the strongest reversal.'),
  ('observational', 'Observational',
   'Collects specific, true-to-life details nobody says out loud, then turns the sharpest one into a joke.'),
  ('wordplay', 'Wordplay',
   'Mines the topic for double meanings, idioms and near-homophones, then writes a pun that also works as a joke.'),
  ('absurd-escalation', 'Absurd escalation',
   'Starts from a mundane premise and escalates it step by step, then lands on the beat where it tips into the absurd.'),
  ('writers-room', 'Writers'' room',
   'One model pitches five jokes, a second heckles every one of them, and a third rewrites the survivor. Spans two providers.')
on conflict (slug) do nothing;

insert into public.prompt_chain_steps (chain_id, position, name, model_id, temperature, system_prompt, user_prompt)
select c.id, s.position, s.name, m.id, s.temperature, s.system_prompt, s.user_prompt
from public.prompt_chains c
join (values
  -- ---------- misdirection ----------
  ('misdirection', 1::smallint, 'List assumptions', 'gpt-5.4-mini', 0.8::numeric,
   $p$You analyse premises for jokes. You do not write jokes. Answer with a numbered list and nothing else.$p$,
   $p$Category: {{category}}
Topic: {{topic}}

List six things a reader automatically assumes when they hear about this — about who is involved, why it happens, what a word means, or what comes next. One line each, stated plainly.$p$),
  ('misdirection', 2::smallint, 'Find reversals', 'gpt-5.4-mini', 1.0::numeric,
   $p$You find the hidden second reading in ordinary assumptions. Answer with a numbered list and nothing else.$p$,
   $p$Assumptions:
{{step1}}

For each assumption, give the most surprising way it could turn out to be wrong while still being consistent with everything said so far. Mark the two reversals that would make the strongest punchline with a ★.$p$),
  ('misdirection', 3::smallint, 'Write the turn', 'gpt-5.4-mini', 0.5::numeric,
   $p$You write short two-part jokes. The setup must be read one way on first pass; the punchline reveals the second reading that was there all along. Never explain the joke. Each line under 280 characters, no surrounding quotation marks.$p$,
   $p$Category: {{category}}

Reversals (★ marks the strongest):
{{step2}}

Jokes that work, for the register:
{{examples}}

Already posted (do not reuse or rephrase):
{{avoid}}

Write one joke built on a starred reversal. The setup should commit fully to the assumption; the punchline should flip it in as few words as possible.$p$),

  -- ---------- observational ----------
  ('observational', 1::smallint, 'Collect details', 'gpt-5.4-mini', 0.9::numeric,
   $p$You are an observational comic taking notes. You do not write jokes yet. Answer with a numbered list and nothing else.$p$,
   $p$Category: {{category}}
Topic: {{topic}}

List eight small, concrete, specific details about this that almost everyone has experienced but rarely says out loud — a habit, a sound, a lie people tell, an unspoken rule. Specific beats general: "the second time you say 'what?' you just laugh and hope" not "mishearing people".$p$),
  ('observational', 2::smallint, 'Write the bit', 'gpt-5.4-mini', 0.6::numeric,
   $p$You write short two-part observational jokes. The setup names a detail the reader instantly recognises; the punchline says the true thing nobody admits, or pushes it one step further. Never explain the joke. Each line under 280 characters, no surrounding quotation marks.$p$,
   $p$Category: {{category}}

Details:
{{step1}}

Techniques you can lean on:
{{terms}}

Already posted (do not reuse or rephrase):
{{avoid}}

Pick the single detail with the most recognition and write one joke about it.$p$),

  -- ---------- wordplay ----------
  ('wordplay', 1::smallint, 'Mine the words', 'gpt-5.4-mini', 0.9::numeric,
   $p$You are a lexicographer helping a pun writer. You do not write jokes. Answer with a list and nothing else.$p$,
   $p$Category: {{category}}
Topic: {{topic}}

List ten words or phrases connected to this topic that have a second meaning, sit inside a common idiom, or sound almost like another word. For each, give both meanings in a few words, like:
- "current": electricity / up to date$p$),
  ('wordplay', 2::smallint, 'Write the pun', 'gpt-5.4-mini', 0.6::numeric,
   $p$You write short two-part jokes that turn on a single double meaning. The setup uses the word in one sense without drawing attention to it; the punchline snaps it into the other sense. A pun that only works as a groan is not good enough — it should also make sense as a joke. Never explain the pun. Each line under 280 characters, no surrounding quotation marks.$p$,
   $p$Category: {{category}}

Word bank:
{{step1}}

Already posted (do not reuse or rephrase):
{{avoid}}

Pick the double meaning where both senses fit the topic most naturally, and write one joke on it.$p$),

  -- ---------- absurd escalation ----------
  ('absurd-escalation', 1::smallint, 'Build the ladder', 'gpt-5.4-mini', 1.1::numeric,
   $p$You plan absurdist comedy. You do not write the final joke. Answer with the premise and a numbered ladder and nothing else.$p$,
   $p$Category: {{category}}
Topic: {{topic}}

Write one mundane, believable premise about this in a single sentence. Then write a ladder of six beats, each one escalating the premise by taking its own logic one step too seriously, until the last beat is completely absurd but still follows from the one before it.$p$),
  ('absurd-escalation', 2::smallint, 'Find the tipping point', 'gpt-5.4-mini', 0.5::numeric,
   $p$You write short two-part absurdist jokes. The setup is the mundane premise stated with a straight face; the punchline jumps to a beat far up the ladder, skipping the steps in between so the reader fills them in. Never explain the joke. Each line under 280 characters, no surrounding quotation marks.$p$,
   $p$Category: {{category}}

Premise and ladder:
{{step1}}

Already posted (do not reuse or rephrase):
{{avoid}}

Choose the beat where it is funniest to jump — usually not the most extreme one, but the first one that is undeniably absurd — and write one joke that lands on it.$p$),

  -- ---------- writers' room ----------
  ('writers-room', 1::smallint, 'Pitch five', 'gemini-3.8-flash', 1.0::numeric,
   $p$You are a staff writer pitching in a writers' room. Fast, varied, no preamble. Each joke is a setup and a punchline.$p$,
   $p$Category: {{category}}
Topic: {{topic}}

Techniques on the board today:
{{terms}}

Already on the board (do not pitch these again):
{{avoid}}

Pitch five jokes, each using a different technique, formatted as:
1. Setup: ...
   Punchline: ...$p$),
  ('writers-room', 2::smallint, 'Heckle', 'gpt-5.4-mini', 0.7::numeric,
   $p$You are the harshest heckler in the room. You are funny, specific and unfair only to bad jokes. For every pitch you say exactly why it fails or, rarely, why it works. Short lines.$p$,
   $p$Pitches:
{{step1}}

Heckle each one in one or two lines: is it predictable, too long, already a famous joke, or does the punchline need explaining? Then name the one pitch that survives your heckling best, and say the single change that would make it hit harder.$p$),
  ('writers-room', 3::smallint, 'Punch up', 'gpt-5.4-mini', 0.3::numeric,
   $p$You are the head writer doing the final punch-up. You return exactly one joke as a setup and a punchline, each under 280 characters, with no surrounding quotation marks.$p$,
   $p$Category: {{category}}

Pitches:
{{step1}}

The heckler's notes:
{{step2}}

Take the pitch the heckler picked, apply their fix, and tighten every word. If their fix makes it worse, keep the original. Do not explain the joke.$p$)
) as s(chain_slug, position, name, model, temperature, system_prompt, user_prompt) on s.chain_slug = c.slug
join public.llm_models m on m.provider_model_id = s.model
where not exists (select 1 from public.prompt_chain_steps x where x.chain_id = c.id and x.position = s.position);

-- Switch the new chains on, once: only while their mix entry is still the
-- untouched one the trigger made, so a weight set later is never overwritten.
update public.prompt_chain_mix x set weight = 1
from public.prompt_chains c
where c.id = x.chain_id
  and c.slug in ('misdirection', 'observational', 'wordplay', 'absurd-escalation', 'writers-room')
  and x.weight = 0 and x.updated_at = x.created_at;
