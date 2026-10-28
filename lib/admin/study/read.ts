import "server-only";

import { assertAdmin } from "@/lib/admin/dal";
import { one, query } from "@/lib/admin/study/db";

// The read-only study views. Every function asserts admin itself, so none can
// be reached by an import that skipped the page gate.

export const PAGE = 50;
const offset = (page: number, size = PAGE) => (page - 1) * size;
const like = (q: string) => `%${q}%`;

// ---------- overview ----------

export async function getStudyCounts() {
  await assertAdmin();
  return one<Record<string, number>>(`
    select
      (select count(*)::int from public.profiles) as users,
      (select count(*)::int from public.humor_flavors) as chains,
      (select count(*)::int from public.humor_flavor_steps) as steps,
      (select count(*)::int from public.humor_flavor_mix) as mix,
      (select count(*)::int from public.terms) as terms,
      (select count(*)::int from public.images) as images,
      (select count(*)::int from public.captions) as captions,
      (select count(*)::int from public.caption_requests) as requests,
      (select count(*)::int from public.caption_examples) as examples,
      (select count(*)::int from public.llm_models) as models,
      (select count(*)::int from public.llm_providers) as providers,
      (select count(*)::int from public.llm_model_responses) as responses,
      (select count(*)::int from public.allowed_signup_domains) as domains,
      (select count(*)::int from public.whitelist_email_addresses) as whitelist`);
}

// ---------- users ----------

export const USER_FLAGS = { superadmin: "is_superadmin", matrix: "is_matrix_admin", study: "is_in_study" } as const;
export type UserFlag = keyof typeof USER_FLAGS;

export type StudyUser = {
  id: string; first_name: string | null; last_name: string | null; email: string | null;
  is_superadmin: boolean; is_matrix_admin: boolean; is_in_study: boolean;
  created_datetime_utc: Date; captions: number; votes: number;
};

export async function listStudyUsers({ q, flag, page }: { q: string; flag: UserFlag | null; page: number }) {
  await assertAdmin();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(like(q));
    conds.push(`(p.email ilike $1 or concat_ws(' ', p.first_name, p.last_name) ilike $1)`);
  }
  if (flag) conds.push(`p.${USER_FLAGS[flag]}`);
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  const [rows, count] = await Promise.all([
    query<StudyUser>(
      `select p.id, p.first_name, p.last_name, p.email, p.is_superadmin, p.is_matrix_admin, p.is_in_study,
              p.created_datetime_utc,
              (select count(*)::int from public.captions c where c.profile_id = p.id) as captions,
              (select count(*)::int from public.caption_votes v where v.profile_id = p.id) as votes
         from public.profiles p ${where}
        order by p.created_datetime_utc desc limit ${PAGE} offset ${offset(page)}`,
      params,
    ),
    one<{ n: number }>(`select count(*)::int as n from public.profiles p ${where}`, params),
  ]);
  return { rows, total: count?.n ?? 0 };
}

// ---------- prompt chains (humor_flavors) ----------

export type Chain = {
  id: number; slug: string; description: string | null; is_pinned: boolean;
  steps: number; captions: number; mix: number | null; modified_datetime_utc: Date; created_by: string | null;
};

const CHAIN_COLS = `f.id::int, f.slug, f.description, f.is_pinned, f.modified_datetime_utc, f.created_datetime_utc,
  (select count(*)::int from public.humor_flavor_steps s where s.humor_flavor_id = f.id) as steps,
  (select count(*)::int from public.captions c where c.humor_flavor_id = f.id) as captions,
  (select sum(x.caption_count)::int from public.humor_flavor_mix x where x.humor_flavor_id = f.id) as mix,
  (select p.email from public.profiles p where p.id = f.created_by_user_id) as created_by`;

export async function listChains({ q, page }: { q: string; page: number }) {
  await assertAdmin();
  const where = q ? `where f.slug ilike $1 or f.description ilike $1` : "";
  const params = q ? [like(q)] : [];
  const [rows, count] = await Promise.all([
    query<Chain>(`select ${CHAIN_COLS} from public.humor_flavors f ${where}
                   order by f.is_pinned desc, f.id desc limit ${PAGE} offset ${offset(page)}`, params),
    one<{ n: number }>(`select count(*)::int as n from public.humor_flavors f ${where}`, params),
  ]);
  return { rows, total: count?.n ?? 0 };
}

export type Step = {
  id: number; humor_flavor_id: number; flavor_slug: string; order_by: number; description: string | null;
  step_type: string; input_type: string; output_type: string; model: string; llm_temperature: string | null;
  llm_system_prompt: string | null; llm_user_prompt: string | null; is_hidden: boolean;
};

const STEP_SELECT = `
  select s.id::int, s.humor_flavor_id::int, f.slug as flavor_slug, s.order_by, s.description, s.is_hidden,
         st.slug as step_type, it.slug as input_type, ot.slug as output_type, m.name as model,
         s.llm_temperature, s.llm_system_prompt, s.llm_user_prompt
    from public.humor_flavor_steps s
    join public.humor_flavors f on f.id = s.humor_flavor_id
    join public.humor_flavor_step_types st on st.id = s.humor_flavor_step_type_id
    join public.llm_input_types it on it.id = s.llm_input_type_id
    join public.llm_output_types ot on ot.id = s.llm_output_type_id
    join public.llm_models m on m.id = s.llm_model_id`;

export async function getChain(id: number) {
  await assertAdmin();
  const chain = await one<Chain & { created_datetime_utc: Date }>(
    `select ${CHAIN_COLS} from public.humor_flavors f where f.id = $1`, [id]);
  if (!chain) return null;
  const [steps, captions, runs] = await Promise.all([
    query<Step>(`${STEP_SELECT} where s.humor_flavor_id = $1 order by s.order_by, s.id`, [id]),
    query<{ id: string; content: string | null; image_id: string; url: string | null; like_count: number; created_datetime_utc: Date }>(
      `select c.id, c.content, c.image_id, i.url, c.like_count::int, c.created_datetime_utc
         from public.captions c join public.images i on i.id = c.image_id
        where c.humor_flavor_id = $1 order by c.created_datetime_utc desc limit 12`, [id]),
    one<{ n: number; avg_seconds: number | null }>(
      `select count(*)::int as n, avg(processing_time_seconds)::float as avg_seconds
         from public.llm_model_responses where humor_flavor_id = $1`, [id]),
  ]);
  return { chain, steps, captions, runs };
}

// ---------- prompt chain steps ----------

export async function listSteps({ q, model, page }: { q: string; model: number | null; page: number }) {
  await assertAdmin();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(like(q));
    conds.push(`(f.slug ilike $${params.length} or s.description ilike $${params.length} or s.llm_system_prompt ilike $${params.length} or s.llm_user_prompt ilike $${params.length})`);
  }
  if (model) {
    params.push(model);
    conds.push(`s.llm_model_id = $${params.length}`);
  }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  const [rows, count, models] = await Promise.all([
    query<Step>(`${STEP_SELECT} ${where} order by s.humor_flavor_id desc, s.order_by limit ${PAGE} offset ${offset(page)}`, params),
    one<{ n: number }>(`select count(*)::int as n from public.humor_flavor_steps s join public.humor_flavors f on f.id = s.humor_flavor_id ${where}`, params),
    modelChoices(),
  ]);
  return { rows, total: count?.n ?? 0, models };
}

function modelChoices() {
  return query<{ id: number; name: string }>(`select id::int, name from public.llm_models order by name`);
}

// ---------- AI media (captions on images) ----------

export const MEDIA_PAGE = 48;

export type MediaCard = {
  id: string; content: string | null; image_id: string; url: string | null; like_count: number;
  is_featured: boolean; flavor_slug: string | null; humor_flavor_id: number | null;
  caption_request_id: number | null; created_datetime_utc: Date;
};

export async function listMedia({ q, featured, page }: { q: string; featured: boolean; page: number }) {
  await assertAdmin();
  const conds: string[] = ["c.humor_flavor_id is not null"];
  const params: unknown[] = [];
  if (q) {
    params.push(like(q));
    conds.push(`(c.content ilike $1 or f.slug ilike $1)`);
  }
  if (featured) conds.push("c.is_featured");
  const where = `where ${conds.join(" and ")}`;
  const from = `public.captions c left join public.humor_flavors f on f.id = c.humor_flavor_id`;
  const [rows, count] = await Promise.all([
    query<MediaCard>(
      `select c.id, c.content, c.image_id, i.url, c.like_count::int, c.is_featured, f.slug as flavor_slug,
              c.humor_flavor_id::int, c.caption_request_id::int, c.created_datetime_utc
         from ${from} join public.images i on i.id = c.image_id ${where}
        order by c.created_datetime_utc desc, c.id desc limit ${MEDIA_PAGE} offset ${offset(page, MEDIA_PAGE)}`,
      params,
    ),
    one<{ n: number }>(`select count(*)::int as n from ${from} ${where}`, params),
  ]);
  return { rows, total: count?.n ?? 0 };
}

export async function getImage(id: string) {
  await assertAdmin();
  const image = await one<{
    id: string; url: string | null; image_description: string | null; additional_context: string | null;
    celebrity_recognition: string | null; is_public: boolean; is_common_use: boolean;
    created_datetime_utc: Date; owner: string | null;
  }>(
    `select i.id, i.url, i.image_description, i.additional_context, i.celebrity_recognition, i.is_public,
            i.is_common_use, i.created_datetime_utc, p.email as owner
       from public.images i left join public.profiles p on p.id = i.profile_id where i.id = $1`,
    [id],
  );
  if (!image) return null;
  const [captions, requests] = await Promise.all([
    query<MediaCard & { votes: number }>(
      `select c.id, c.content, c.image_id, null as url, c.like_count::int, c.is_featured, f.slug as flavor_slug,
              c.humor_flavor_id::int, c.caption_request_id::int, c.created_datetime_utc,
              (select count(*)::int from public.caption_votes v where v.caption_id = c.id) as votes
         from public.captions c left join public.humor_flavors f on f.id = c.humor_flavor_id
        where c.image_id = $1 order by c.like_count desc, c.created_datetime_utc desc limit 200`,
      [id],
    ),
    query<{ id: number; created_datetime_utc: Date; requester: string | null }>(
      `select r.id::int, r.created_datetime_utc, p.email as requester
         from public.caption_requests r left join public.profiles p on p.id = r.profile_id
        where r.image_id = $1 order by r.created_datetime_utc desc limit 50`,
      [id],
    ),
  ]);
  return { image, captions, requests };
}

// ---------- generation requests ----------

export type GenRequest = {
  id: number; created_datetime_utc: Date; image_id: string; url: string | null; requester: string | null;
  chains: number; responses: number; captions: number;
};

export async function listRequests({ q, page }: { q: string; page: number }) {
  await assertAdmin();
  const params: unknown[] = [];
  let where = "";
  if (/^\d+$/.test(q)) {
    params.push(Number(q));
    where = "where r.id = $1";
  } else if (q) {
    params.push(like(q));
    where = "where p.email ilike $1";
  }
  const from = `public.caption_requests r left join public.profiles p on p.id = r.profile_id`;
  const [rows, count] = await Promise.all([
    query<GenRequest>(
      `select r.id::int, r.created_datetime_utc, r.image_id, i.url, p.email as requester,
              (select count(*)::int from public.llm_prompt_chains pc where pc.caption_request_id = r.id) as chains,
              (select count(*)::int from public.llm_model_responses mr where mr.caption_request_id = r.id) as responses,
              (select count(*)::int from public.captions c where c.caption_request_id = r.id) as captions
         from ${from} join public.images i on i.id = r.image_id ${where}
        order by r.created_datetime_utc desc limit ${PAGE} offset ${offset(page)}`,
      params,
    ),
    one<{ n: number }>(`select count(*)::int as n from ${from} ${where}`, params),
  ]);
  return { rows, total: count?.n ?? 0 };
}

export type ResponseRow = {
  id: string; created_datetime_utc: Date; model: string; flavor_slug: string; humor_flavor_id: number;
  step_order: number | null; processing_time_seconds: number; llm_temperature: string | null;
  llm_model_response: string | null; caption_request_id: number; llm_prompt_chain_id: number | null;
};

const RESPONSE_SELECT = `
  select mr.id, mr.created_datetime_utc, m.name as model, f.slug as flavor_slug, mr.humor_flavor_id::int,
         s.order_by as step_order, mr.processing_time_seconds, mr.llm_temperature,
         left(mr.llm_model_response, 400) as llm_model_response, mr.caption_request_id::int, mr.llm_prompt_chain_id::int
    from public.llm_model_responses mr
    join public.llm_models m on m.id = mr.llm_model_id
    join public.humor_flavors f on f.id = mr.humor_flavor_id
    left join public.humor_flavor_steps s on s.id = mr.humor_flavor_step_id`;

export async function getRequest(id: number) {
  await assertAdmin();
  const request = await one<GenRequest & { image_description: string | null }>(
    `select r.id::int, r.created_datetime_utc, r.image_id, i.url, i.image_description, p.email as requester
       from public.caption_requests r join public.images i on i.id = r.image_id
       left join public.profiles p on p.id = r.profile_id where r.id = $1`,
    [id],
  );
  if (!request) return null;
  const [chains, responses, captions] = await Promise.all([
    query<{ id: number; created_datetime_utc: Date }>(
      `select id::int, created_datetime_utc from public.llm_prompt_chains where caption_request_id = $1 order by id`, [id]),
    query<ResponseRow>(`${RESPONSE_SELECT} where mr.caption_request_id = $1 order by mr.created_datetime_utc`, [id]),
    query<MediaCard>(
      `select c.id, c.content, c.image_id, null as url, c.like_count::int, c.is_featured, f.slug as flavor_slug,
              c.humor_flavor_id::int, c.caption_request_id::int, c.created_datetime_utc, c.llm_prompt_chain_id::int
         from public.captions c left join public.humor_flavors f on f.id = c.humor_flavor_id
        where c.caption_request_id = $1 order by c.created_datetime_utc`, [id]),
  ]);
  return { request, chains, responses, captions };
}

// ---------- LLM responses ----------

export async function listResponses({ model, flavor, page }: { model: number | null; flavor: number | null; page: number }) {
  await assertAdmin();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (model) {
    params.push(model);
    conds.push(`mr.llm_model_id = $${params.length}`);
  }
  if (flavor) {
    params.push(flavor);
    conds.push(`mr.humor_flavor_id = $${params.length}`);
  }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  const [rows, count, models] = await Promise.all([
    query<ResponseRow>(`${RESPONSE_SELECT} ${where} order by mr.created_datetime_utc desc limit ${PAGE} offset ${offset(page)}`, params),
    one<{ n: number }>(`select count(*)::int as n from public.llm_model_responses mr ${where}`, params),
    modelChoices(),
  ]);
  return { rows, total: count?.n ?? 0, models };
}

export async function getResponse(id: string) {
  await assertAdmin();
  return one<ResponseRow & { llm_system_prompt: string; llm_user_prompt: string; requester: string | null; humor_flavor_step_id: number | null }>(
    `select mr.id, mr.created_datetime_utc, m.name as model, f.slug as flavor_slug, mr.humor_flavor_id::int,
            s.order_by as step_order, mr.humor_flavor_step_id::int, mr.processing_time_seconds, mr.llm_temperature,
            mr.llm_model_response, mr.caption_request_id::int, mr.llm_prompt_chain_id::int,
            mr.llm_system_prompt, mr.llm_user_prompt, p.email as requester
       from public.llm_model_responses mr
       join public.llm_models m on m.id = mr.llm_model_id
       join public.humor_flavors f on f.id = mr.humor_flavor_id
       left join public.humor_flavor_steps s on s.id = mr.humor_flavor_step_id
       left join public.profiles p on p.id = mr.profile_id
      where mr.id = $1`,
    [id],
  );
}
