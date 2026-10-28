import "server-only";

import { pool, query } from "@/lib/db";
import { checkTemplate, fillTemplate } from "@/lib/chain-template";
import { MAX_JOKE_CHARS } from "@/lib/generate";
import { callWithFallback, isConfigured, statusOf, type ModelRef } from "@/lib/llm";

// Runs a prompt chain (0013): the steps of one chain in order, each step's
// answer available to later steps as {{stepN}}, the last step's answer parsed
// as the joke. Reads the configuration over the owner pool — the chain tables
// grant the publishable key nothing — so this module is server-only.

export type ChainInput = {
  category: string;
  // What the user typed in the topic box, or null when they just pressed the
  // button — the normal case.
  topic: string | null;
  // Setups already posted in this category, so the model can see what it must
  // not repeat; capped by the caller, not here.
  avoid: string[];
};

export type TraceStep = {
  position: number;
  stepId: number;
  stepName: string;
  modelId: number;
  model: string; // as served
  temperature: number | null;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  durationMs: number;
};

export type ChainRun = {
  chain: { id: number; name: string };
  // The model the user picked, or null for Auto.
  picked: ModelRef | null;
  joke: { setup: string; punchline: string; model: string };
  trace: TraceStep[];
};

// A failure partway through, carrying the steps that did finish so a test run
// in the admin panel can show how far it got. `status` is copied from the
// provider's error so callers can still tell "busy" from "broken".
export class ChainError extends Error {
  constructor(
    message: string,
    readonly trace: TraceStep[],
    readonly stepName: string | null,
    readonly status: number | null,
  ) {
    super(message);
  }
}

type StepRow = {
  id: number;
  position: number;
  name: string;
  temperature: string | null;
  system_prompt: string;
  user_prompt: string;
  model_id: number;
  model_name: string;
  provider: string;
  provider_model_id: string;
  supports_temperature: boolean;
};

type ModelRow = { id: number; name: string; provider: string; provider_model_id: string; supports_temperature: boolean };

const toModel = (r: ModelRow): ModelRef => ({
  id: r.id, name: r.name, provider: r.provider, providerModelId: r.provider_model_id, supportsTemperature: r.supports_temperature,
});

// Every active model whose provider has code and a key, in id order. This is
// both the Generate picker's list and the pool a step falls back through.
export async function listPickableModels(): Promise<ModelRef[]> {
  const { rows } = await query<ModelRow>(
    `select m.id::int, m.name, p.slug as provider, m.provider_model_id, m.supports_temperature
       from public.llm_models m join public.llm_providers p on p.id = m.provider_id
      where m.is_active order by m.id`);
  return rows.map(toModel).filter((m) => isConfigured(m.provider));
}

// The chains a user can pick as a style on Generate: exactly the ones the mix
// can draw — switched on and with at least one step — so an admin turning a
// chain off in the mix also takes it out of the picker.
export async function listPickableChains() {
  const { rows } = await query<{ id: number; name: string; description: string | null }>(
    `select c.id::int, c.name, c.description
       from public.prompt_chains c
       join public.prompt_chain_mix x on x.chain_id = c.id
      where x.weight > 0
        and exists (select 1 from public.prompt_chain_steps s where s.chain_id = c.id)
      order by c.name`);
  return rows;
}

// The chain to run: the one asked for (a style pick or an admin test run), otherwise a weighted
// draw from the mix. Only chains with at least one step can be drawn.
async function pickChain(chainId?: number): Promise<{ id: number; name: string }> {
  if (chainId != null) {
    const { rows } = await query<{ id: number; name: string }>(
      `select id::int, name from public.prompt_chains where id = $1`, [chainId]);
    if (!rows[0]) throw new ChainError("That prompt chain no longer exists.", [], null, null);
    return rows[0];
  }

  const { rows } = await query<{ id: number; name: string; weight: number }>(
    `select c.id::int, c.name, x.weight
       from public.prompt_chains c
       join public.prompt_chain_mix x on x.chain_id = c.id
      where x.weight > 0
        and exists (select 1 from public.prompt_chain_steps s where s.chain_id = c.id)
      order by c.id`);
  const total = rows.reduce((sum, r) => sum + r.weight, 0);
  if (!total) {
    throw new ChainError("No prompt chain is switched on. An admin needs to give one a weight in the mix.", [], null, null);
  }
  let draw = Math.random() * total;
  for (const row of rows) {
    draw -= row.weight;
    if (draw < 0) return row;
  }
  return rows[rows.length - 1];
}

async function loadContext(category: string) {
  const [terms, examples, fallback] = await Promise.all([
    query<{ term: string; definition: string; example: string | null }>(
      `select term, definition, example from public.terms order by priority desc, term limit 12`),
    query<{ setup: string; punchline: string; note: string | null }>(
      `select setup, punchline, note from public.generation_examples
        where category is null or lower(category) = lower($1)
        order by (category is not null) desc, priority desc, id limit 6`, [category]),
    listPickableModels(),
  ]);
  return { terms: terms.rows, examples: examples.rows, fallback };
}

function parseJoke(text: string) {
  // The schema constrains the shape, but it is still JSON over a wire and a
  // truncated response parses as nothing. Treated as a bad answer from this
  // model rather than a crash, so the fallback can try the next one.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The last step returned something that was not JSON.");
  }
  const setup = String((parsed as { setup?: unknown })?.setup ?? "").trim();
  const punchline = String((parsed as { punchline?: unknown })?.punchline ?? "").trim();
  if (!setup || !punchline) throw new Error("The last step left half the joke out.");
  if (setup.length > MAX_JOKE_CHARS || punchline.length > MAX_JOKE_CHARS) {
    throw new Error("The last step wrote past the length limit.");
  }
  return { setup, punchline };
}

// `modelId` is the picker: every step runs on that one model, and only that
// model — someone who chose it should not get a different one without being
// told. Without it (Auto) each step runs on its own configured model and falls
// back through the other pickable models, same provider first, so an outage at
// one provider is carried by the other.
export async function runChain(input: ChainInput, opts: { chainId?: number; modelId?: number | null } = {}): Promise<ChainRun> {
  const chain = await pickChain(opts.chainId);
  const [{ rows: steps }, ctx] = await Promise.all([
    query<StepRow>(
      `select s.id::int, s.position, s.name, s.temperature::text, s.system_prompt, s.user_prompt,
              m.id::int as model_id, m.name as model_name, p.slug as provider, m.provider_model_id, m.supports_temperature
         from public.prompt_chain_steps s
         join public.llm_models m on m.id = s.model_id
         join public.llm_providers p on p.id = m.provider_id
        where s.chain_id = $1 order by s.position`, [chain.id]),
    loadContext(input.category),
  ]);
  if (!steps.length) throw new ChainError(`“${chain.name}” has no steps yet.`, [], null, null);

  let picked: ModelRef | null = null;
  if (opts.modelId != null) {
    picked = ctx.fallback.find((m) => m.id === opts.modelId) ?? null;
    if (!picked) throw new ChainError("That model is not available any more. Pick another.", [], null, null);
  }

  const values: Record<string, string> = {
    category: input.category,
    topic: input.topic ?? "(nothing in particular — anything in the category)",
    avoid: input.avoid.length ? input.avoid.map((s) => `- ${s}`).join("\n") : "(nothing yet)",
    terms: ctx.terms.length
      ? ctx.terms.map((t) => `- ${t.term}: ${t.definition}${t.example ? ` (e.g. “${t.example}”)` : ""}`).join("\n")
      : "(none)",
    examples: ctx.examples.length
      ? ctx.examples.map((e) => `Setup: ${e.setup}\nPunchline: ${e.punchline}${e.note ? `\nWhy it works: ${e.note}` : ""}`).join("\n\n")
      : "(none)",
  };

  const trace: TraceStep[] = [];
  let joke: { setup: string; punchline: string } | null = null;
  let served = "";

  for (const [i, step] of steps.entries()) {
    const last = i === steps.length - 1;

    // Re-checked here as well as at the form: a step renumbered after it was
    // saved can end up reading a step that now runs after it.
    const problem = checkTemplate(step.system_prompt, step.position) ?? checkTemplate(step.user_prompt, step.position);
    if (problem) throw new ChainError(`Step ${step.position} (“${step.name}”): ${problem}`, trace, step.name, null);

    const primary = toModel({ ...step, id: step.model_id, name: step.model_name });
    const models = picked
      ? [picked]
      : [
          primary,
          ...ctx.fallback.filter((m) => m.id !== primary.id && m.provider === primary.provider),
          ...ctx.fallback.filter((m) => m.provider !== primary.provider),
        ].filter((m) => isConfigured(m.provider));
    if (!models.length) {
      throw new ChainError(`Step ${step.position} (“${step.name}”): no model with a configured API key can run it.`, trace, step.name, null);
    }
    const temperature = step.temperature == null ? null : Number(step.temperature);
    const systemPrompt = fillTemplate(step.system_prompt, values);
    const userPrompt = fillTemplate(step.user_prompt, values);

    const started = Date.now();
    let result;
    try {
      result = await callWithFallback(
        models,
        { system: systemPrompt, user: userPrompt, temperature, json: last },
        (text): string | { setup: string; punchline: string } => (last ? parseJoke(text) : text.trim()),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "The model call failed.";
      throw new ChainError(`Step ${step.position} (“${step.name}”) failed: ${message}`, trace, step.name, statusOf(error));
    }

    trace.push({
      position: step.position, stepId: step.id, stepName: step.name,
      modelId: result.model.id, model: result.served, temperature,
      systemPrompt, userPrompt, response: result.text, durationMs: Date.now() - started,
    });

    // Keyed by the step's own position, which is what {{stepN}} names, even if
    // positions have gaps.
    values[`step${step.position}`] = typeof result.value === "string" ? result.value : result.text;
    if (last) {
      joke = result.value as { setup: string; punchline: string };
      served = result.served;
    }
  }

  return { chain, picked, joke: { ...joke!, model: served }, trace };
}

// Written after the generation row exists, so every response hangs off the
// request it belongs to.
export async function saveTrace(generationId: number, chainId: number, trace: TraceStep[]) {
  if (!trace.length) return;
  const cols = 12;
  const params: unknown[] = [];
  const rows = trace.map((t, i) => {
    params.push(generationId, chainId, t.stepId, t.modelId, t.position, t.stepName, t.model,
      t.temperature, t.systemPrompt, t.userPrompt, t.response, t.durationMs);
    return `(${Array.from({ length: cols }, (_, k) => `$${i * cols + k + 1}`).join(", ")})`;
  });
  await pool.query(
    `insert into public.llm_responses
       (generation_id, chain_id, step_id, model_id, position, step_name, model,
        temperature, system_prompt, user_prompt, response, duration_ms)
     values ${rows.join(", ")}`,
    params,
  );
}
