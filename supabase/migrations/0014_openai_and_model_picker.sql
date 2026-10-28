-- OpenAI as a second provider, and a model picker on Generate.
-- Idempotent: safe to re-run.
--
-- lib/llm.ts now has code for providers with slug 'openai' (OPENAI_API_KEY)
-- beside 'google'. The models below were probed against the key before this
-- was written: all four accept the strict JSON schema the last step needs, and
-- gpt-5.5 refuses any temperature but its default with a 400 — hence
-- supports_temperature = false on that row, which makes the runner leave the
-- step's temperature out of the request instead of failing it.

insert into public.llm_providers (name, slug)
values ('OpenAI', 'openai')
on conflict (slug) do nothing;

insert into public.llm_models (provider_id, name, provider_model_id, supports_temperature)
select p.id, m.name, m.provider_model_id, m.supports_temperature
from public.llm_providers p,
     (values ('GPT-5.4 mini', 'gpt-5.4-mini', true),
             ('GPT-5.4 nano', 'gpt-5.4-nano', true),
             ('GPT-4.1 mini', 'gpt-4.1-mini', true),
             ('GPT-5.5',      'gpt-5.5',      false)) as m(name, provider_model_id, supports_temperature)
where p.slug = 'openai'
on conflict (provider_id, provider_model_id) do nothing;

-- ---------- the pick ----------
--
-- What the user chose in the picker: a model that ran every step of the chain,
-- or NULL for Auto — each step on its own configured model, with fallback.
-- Distinct from generations.model, which is what actually answered the last
-- step and is what the card's badge shows. `set null` for the usual reason:
-- deleting a model must not erase the history of what it wrote.
alter table public.generations
  add column if not exists model_id bigint references public.llm_models(id) on delete set null;
