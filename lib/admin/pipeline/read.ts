import "server-only";

import { assertAdmin } from "@/lib/admin/dal";
import { one, query } from "@/lib/admin/db";

// The read-only pipeline views: counts, a chain with its steps, generation
// requests with their traces, and the LLM responses. Every function asserts
// admin itself, so none can be reached by an import that skipped the page gate.

export const PAGE = 50;

export async function getPipelineCounts() {
  await assertAdmin();
  return one<Record<string, number>>(`
    select
      (select count(*)::int from public.profiles)               as users,
      (select count(*)::int from public.prompt_chains)          as chains,
      (select count(*)::int from public.prompt_chain_steps)     as steps,
      (select count(*)::int from public.prompt_chain_mix where weight > 0) as mix,
      (select count(*)::int from public.terms)                  as terms,
      (select count(*)::int from public.jokes where source = 'ai') as media,
      (select count(*)::int from public.generations)            as requests,
      (select count(*)::int from public.generation_examples)    as examples,
      (select count(*)::int from public.llm_models)             as models,
      (select count(*)::int from public.llm_providers)          as providers,
      (select count(*)::int from public.llm_responses)          as responses,
      (select count(*)::int from public.allowed_signup_domains) as domains,
      (select count(*)::int from public.whitelisted_emails)     as whitelist`);
}

// ---------- a chain and its steps ----------

export type Step = {
  id: number; position: number; name: string; temperature: string | null;
  system_prompt: string; user_prompt: string;
  model_id: number; model_name: string; provider_model_id: string; provider: string; is_active: boolean;
  calls: number; avg_ms: number | null; updated_at: Date;
};

export type RunRow = {
  id: number; created_at: Date; category: string; prompt: string | null; model: string;
  setup: string | null; punchline: string | null; chain_id: number | null; chain_name: string | null;
  steps: number; total_ms: number | null; posted_id: number | null; picked_model: string | null; chain_picked: boolean;
  first_name: string | null; last_name: string | null; user_id: string;
};

const RUN_COLUMNS = `
  g.id::int, g.created_at, g.category, g.prompt, g.model,
  g.candidates -> 0 ->> 'setup' as setup, g.candidates -> 0 ->> 'punchline' as punchline,
  g.chain_id::int, c.name as chain_name, pm.name as picked_model, g.chain_picked,
  (select count(*)::int from public.llm_responses lr where lr.generation_id = g.id) as steps,
  (select sum(lr.duration_ms)::int from public.llm_responses lr where lr.generation_id = g.id) as total_ms,
  (select j.id::int from public.jokes j where j.generation_id = g.id) as posted_id,
  p.first_name, p.last_name, g.user_id`;

const RUN_FROM = `
  from public.generations g
  left join public.prompt_chains c on c.id = g.chain_id
  left join public.llm_models pm on pm.id = g.model_id
  left join public.profiles p on p.id = g.user_id`;

export async function getChainSteps(chainId: number) {
  await assertAdmin();
  const [steps, runs, categories, mix] = await Promise.all([
    query<Step>(
      `select s.id::int, s.position, s.name, s.temperature::text, s.system_prompt, s.user_prompt, s.updated_at,
              m.id::int as model_id, m.name as model_name, m.provider_model_id, p.slug as provider, m.is_active,
              (select count(*)::int from public.llm_responses lr where lr.step_id = s.id) as calls,
              (select avg(lr.duration_ms)::int from public.llm_responses lr where lr.step_id = s.id) as avg_ms
         from public.prompt_chain_steps s
         join public.llm_models m on m.id = s.model_id
         join public.llm_providers p on p.id = m.provider_id
        where s.chain_id = $1 order by s.position`, [chainId]),
    query<RunRow>(`select ${RUN_COLUMNS} ${RUN_FROM} where g.chain_id = $1 order by g.created_at desc limit 10`, [chainId]),
    query<{ category: string }>(`select category from public.jokes group by category order by count(*) desc limit 30`),
    one<{ id: number; weight: number; total: number }>(
      `select x.id::int, x.weight, (select sum(weight)::int from public.prompt_chain_mix) as total
         from public.prompt_chain_mix x where x.chain_id = $1`, [chainId]),
  ]);
  return { steps, runs, categories: categories.map((c) => c.category), mix };
}

// ---------- generation requests ----------

export async function listRequests({ q, chain, page }: { q: string; chain: number | null; page: number }) {
  await assertAdmin();
  const where = `
    where ($1 = '' or g.category ilike '%' || $1 || '%' or coalesce(g.prompt, '') ilike '%' || $1 || '%'
                   or g.candidates::text ilike '%' || $1 || '%')
      and ($2::bigint is null or g.chain_id = $2)`;
  const params = [q, chain];
  const [rows, count, chains] = await Promise.all([
    query<RunRow>(`select ${RUN_COLUMNS} ${RUN_FROM} ${where} order by g.created_at desc limit ${PAGE} offset $3`,
      [...params, (page - 1) * PAGE]),
    one<{ n: number }>(`select count(*)::int as n from public.generations g ${where}`, params),
    query<{ id: number; name: string }>(`select id::int, name from public.prompt_chains order by name`),
  ]);
  return { rows, total: count?.n ?? 0, chains };
}

export type ResponseRow = {
  id: number; generation_id: number; chain_id: number | null; chain_name: string | null;
  step_id: number | null; position: number; step_name: string; model_id: number | null; model: string;
  temperature: string | null; system_prompt: string; user_prompt: string; response: string;
  duration_ms: number; created_at: Date;
};

const RESPONSE_COLUMNS = `
  lr.id::int, lr.generation_id::int, lr.chain_id::int, c.name as chain_name, lr.step_id::int,
  lr.position, lr.step_name, lr.model_id::int, lr.model, lr.temperature::text,
  lr.system_prompt, lr.user_prompt, lr.response, lr.duration_ms, lr.created_at`;

export async function getRequest(id: number) {
  await assertAdmin();
  const request = await one<RunRow>(`select ${RUN_COLUMNS} ${RUN_FROM} where g.id = $1`, [id]);
  if (!request) return null;
  const trace = await query<ResponseRow>(
    `select ${RESPONSE_COLUMNS} from public.llm_responses lr
       left join public.prompt_chains c on c.id = lr.chain_id
      where lr.generation_id = $1 order by lr.position`, [id]);
  return { request, trace };
}

// ---------- llm responses ----------

export async function listResponses({ q, page }: { q: string; page: number }) {
  await assertAdmin();
  const where = `where ($1 = '' or lr.response ilike '%' || $1 || '%' or lr.step_name ilike '%' || $1 || '%'
                                or lr.model ilike '%' || $1 || '%')`;
  const [rows, count] = await Promise.all([
    query<ResponseRow>(
      `select ${RESPONSE_COLUMNS} from public.llm_responses lr
         left join public.prompt_chains c on c.id = lr.chain_id
         ${where} order by lr.created_at desc, lr.position limit ${PAGE} offset $2`,
      [q, (page - 1) * PAGE]),
    one<{ n: number }>(`select count(*)::int as n from public.llm_responses lr ${where}`, [q]),
  ]);
  return { rows, total: count?.n ?? 0 };
}

export async function getResponse(id: number) {
  await assertAdmin();
  return one<ResponseRow>(
    `select ${RESPONSE_COLUMNS} from public.llm_responses lr
       left join public.prompt_chains c on c.id = lr.chain_id
      where lr.id = $1`, [id]);
}
