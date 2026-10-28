import "server-only";

import { checkTemplate, PLACEHOLDERS } from "@/lib/chain-template";
import type { Field } from "@/lib/admin/pipeline/fields";

// The prompt-chain tables (0013) the panel edits row by row. Each entry drives
// one list page, one create page and one edit page (app/admin/pipeline/[resource]).
// Table names, column names and SQL fragments here are the only identifiers
// ever interpolated into a query — a resource slug from the URL is looked up in
// RESOURCES and never reaches SQL itself. Every value goes in as a parameter.

export type Column = {
  key: string;
  label: string;
  sql: string;
  kind?: "link" | "mono" | "bool" | "clip" | "num" | "ago";
};

export type Resource = {
  slug: string;
  table: string;
  title: string;
  singular: string;
  blurb: string;
  ops: { create: boolean; delete: boolean };
  fields: Field[];
  // What the edit page calls a row, as SQL over the row aliased `r`.
  headingSql: string;
  from: string;
  idSql: string;
  columns: Column[];
  search: string[];
  order: string;
  // What a unique violation means for this table.
  conflict: string;
  // Checks that need more than one field, run after parsing. A string is the
  // problem to show.
  validate?: (values: Record<string, unknown>) => string | null;
};

export const OPTION_SOURCES: Record<string, string> = {
  chains: `select id::text as value, name as label from public.prompt_chains order by name`,
  models: `select m.id::text as value, m.name || ' · ' || m.provider_model_id || case when m.is_active then '' else ' (inactive)' end as label
             from public.llm_models m order by m.id`,
  providers: `select id::text as value, name as label from public.llm_providers order by name`,
};

const SMALLINT = { min: -32768, max: 32767 };

const updated: Column = { key: "updated", label: "Updated", sql: "updated_at", kind: "ago" };

export const PLACEHOLDER_HINT = `Placeholders: ${Object.keys(PLACEHOLDERS).map((p) => `{{${p}}}`).join(", ")}, and {{step1}}, {{step2}}… for the answer of an earlier step.`;

export const RESOURCES: Record<string, Resource> = {
  chains: {
    slug: "chains", table: "prompt_chains", title: "Prompt chains", singular: "prompt chain",
    blurb: "Each chain is an ordered list of model calls that ends in a joke. Generate picks one by its weight in the mix.",
    ops: { create: true, delete: true },
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 100, half: true },
      { name: "slug", label: "Slug", type: "slug", required: true, max: 60, mono: true, half: true, hint: "Lowercase letters, digits and dashes." },
      { name: "description", label: "Description", type: "textarea", max: 2000, rows: 3 },
    ],
    headingSql: "r.name",
    from: `public.prompt_chains c join public.prompt_chain_mix x on x.chain_id = c.id`,
    idSql: "c.id",
    columns: [
      { key: "name", label: "Chain", sql: "c.name", kind: "link" },
      { key: "slug", label: "Slug", sql: "c.slug", kind: "mono" },
      { key: "steps", label: "Steps", sql: "(select count(*) from public.prompt_chain_steps s where s.chain_id = c.id)", kind: "num" },
      { key: "weight", label: "Mix weight", sql: "x.weight", kind: "num" },
      { key: "runs", label: "Runs", sql: "(select count(*) from public.generations g where g.chain_id = c.id)", kind: "num" },
      { ...updated, sql: "c.updated_at" },
    ],
    search: ["c.name", "c.slug", "c.description"],
    order: "x.weight desc, c.name",
    conflict: "A chain with that slug already exists.",
  },

  steps: {
    slug: "steps", table: "prompt_chain_steps", title: "Prompt chain steps", singular: "step",
    blurb: "One model call each. Steps run in position order; every step but the last answers in prose, and the last answers with the joke.",
    ops: { create: true, delete: true },
    fields: [
      { name: "chain_id", label: "Chain", type: "select", required: true, options: "chains", half: true },
      { name: "position", label: "Position", type: "int", required: true, min: 1, max: 20, default: "1", half: true },
      { name: "name", label: "Name", type: "text", required: true, max: 100, half: true },
      { name: "model_id", label: "Model", type: "select", required: true, options: "models", half: true },
      { name: "temperature", label: "Temperature", type: "decimal", min: 0, max: 2, half: true, hint: "0 to 2. Empty uses the model's default." },
      { name: "system_prompt", label: "System prompt", type: "textarea", required: true, max: 20000, rows: 6, mono: true },
      { name: "user_prompt", label: "User prompt", type: "textarea", required: true, max: 20000, rows: 12, mono: true, hint: PLACEHOLDER_HINT },
    ],
    headingSql: "r.name",
    from: `public.prompt_chain_steps s
             join public.prompt_chains c on c.id = s.chain_id
             join public.llm_models m on m.id = s.model_id`,
    idSql: "s.id",
    columns: [
      { key: "name", label: "Step", sql: "s.name", kind: "link" },
      { key: "chain", label: "Chain", sql: "c.name" },
      { key: "position", label: "Position", sql: "s.position", kind: "num" },
      { key: "model", label: "Model", sql: "m.provider_model_id", kind: "mono" },
      { key: "temperature", label: "Temp", sql: "s.temperature::text", kind: "mono" },
      { key: "calls", label: "Calls", sql: "(select count(*) from public.llm_responses lr where lr.step_id = s.id)", kind: "num" },
      { ...updated, sql: "s.updated_at" },
    ],
    search: ["s.name", "c.name", "s.system_prompt", "s.user_prompt"],
    order: "c.name, s.position",
    conflict: "That chain already has a step at that position. Pick another position, or move the other step first.",
    validate: (v) => {
      const position = Number(v.position);
      return checkTemplate(String(v.system_prompt ?? ""), position)
        ?? checkTemplate(String(v.user_prompt ?? ""), position);
    },
  },

  mix: {
    slug: "mix", table: "prompt_chain_mix", title: "Prompt chain mix", singular: "mix entry",
    blurb: "How often Generate picks each chain: weight ÷ the sum of all weights. 0 switches a chain off. Every chain has exactly one entry.",
    ops: { create: false, delete: false },
    fields: [
      { name: "weight", label: "Weight", type: "int", required: true, min: 0, max: 100, hint: "0 to 100. A chain with no steps is never picked, whatever its weight." },
    ],
    headingSql: "(select name from public.prompt_chains c where c.id = r.chain_id)",
    from: `public.prompt_chain_mix x join public.prompt_chains c on c.id = x.chain_id`,
    idSql: "x.id",
    columns: [
      { key: "chain", label: "Chain", sql: "c.name", kind: "link" },
      { key: "weight", label: "Weight", sql: "x.weight", kind: "num" },
      { key: "share", label: "Share of runs",
        sql: "case when x.weight = 0 then 'off' else round(100.0 * x.weight / nullif(sum(x.weight) over (), 0))::text || '%' end" },
      { key: "steps", label: "Steps", sql: "(select count(*) from public.prompt_chain_steps s where s.chain_id = c.id)", kind: "num" },
      { ...updated, sql: "x.updated_at" },
    ],
    search: ["c.name", "c.slug"],
    order: "x.weight desc, c.name",
    conflict: "That chain already has a mix entry.",
  },

  terms: {
    slug: "terms", table: "terms", title: "Terms", singular: "term",
    blurb: "Comedic techniques a prompt can draw on through {{terms}}. Higher priority terms are listed first; the top 12 are sent.",
    ops: { create: true, delete: true },
    fields: [
      { name: "term", label: "Term", type: "text", required: true, max: 200, half: true },
      { name: "priority", label: "Priority", type: "int", required: true, default: "0", ...SMALLINT, half: true },
      { name: "definition", label: "Definition", type: "textarea", required: true, max: 2000, rows: 3 },
      { name: "example", label: "Example", type: "textarea", max: 2000, rows: 2 },
    ],
    headingSql: "r.term",
    from: `public.terms t`,
    idSql: "t.id",
    columns: [
      { key: "term", label: "Term", sql: "t.term", kind: "link" },
      { key: "definition", label: "Definition", sql: "t.definition", kind: "clip" },
      { key: "priority", label: "Priority", sql: "t.priority", kind: "num" },
      { ...updated, sql: "t.updated_at" },
    ],
    search: ["t.term", "t.definition", "t.example"],
    order: "t.priority desc, t.term",
    conflict: "That term already exists.",
  },

  examples: {
    slug: "examples", table: "generation_examples", title: "Generation examples", singular: "example",
    blurb: "Few-shot jokes a prompt can draw on through {{examples}}. Examples for the requested category come first, then the general ones; six are sent.",
    ops: { create: true, delete: true },
    fields: [
      { name: "setup", label: "Setup", type: "textarea", required: true, max: 280, rows: 2 },
      { name: "punchline", label: "Punchline", type: "textarea", required: true, max: 280, rows: 2 },
      { name: "note", label: "Why it works", type: "textarea", max: 2000, rows: 2 },
      { name: "category", label: "Category", type: "text", max: 40, half: true, hint: "Empty offers it for every category." },
      { name: "priority", label: "Priority", type: "int", required: true, default: "0", ...SMALLINT, half: true },
    ],
    headingSql: "r.setup",
    from: `public.generation_examples e`,
    idSql: "e.id",
    columns: [
      { key: "setup", label: "Setup", sql: "e.setup", kind: "link" },
      { key: "punchline", label: "Punchline", sql: "e.punchline", kind: "clip" },
      { key: "category", label: "Category", sql: "coalesce(e.category, 'any')" },
      { key: "priority", label: "Priority", sql: "e.priority", kind: "num" },
      { ...updated, sql: "e.updated_at" },
    ],
    search: ["e.setup", "e.punchline", "e.note", "e.category"],
    order: "e.priority desc, e.id desc",
    conflict: "That example already exists.",
  },

  models: {
    slug: "models", table: "llm_models", title: "LLM models", singular: "model",
    blurb: "Models a step can run on. The provider model id is the exact string sent to the API. Active models are offered in the Generate picker. On Auto, when a step's model is out of capacity, the other active models are tried, same provider first, in this order.",
    ops: { create: true, delete: true },
    fields: [
      { name: "name", label: "Display name", type: "text", required: true, max: 100, half: true },
      { name: "provider_id", label: "Provider", type: "select", required: true, options: "providers", half: true },
      { name: "provider_model_id", label: "Provider model id", type: "text", required: true, max: 200, mono: true, hint: "e.g. gemini-3.1-flash-lite" },
      { name: "supports_temperature", label: "Accepts a temperature setting", type: "bool", default: "on" },
      { name: "is_active", label: "Active — offered in the Generate picker and used as a fallback", type: "bool", default: "on" },
    ],
    headingSql: "r.name",
    from: `public.llm_models m join public.llm_providers p on p.id = m.provider_id`,
    idSql: "m.id",
    columns: [
      { key: "name", label: "Model", sql: "m.name", kind: "link" },
      { key: "provider", label: "Provider", sql: "p.name" },
      { key: "provider_model_id", label: "Provider model id", sql: "m.provider_model_id", kind: "mono" },
      { key: "active", label: "Active", sql: "m.is_active", kind: "bool" },
      { key: "steps", label: "Steps using it", sql: "(select count(*) from public.prompt_chain_steps s where s.model_id = m.id)", kind: "num" },
      { key: "calls", label: "Calls answered", sql: "(select count(*) from public.llm_responses lr where lr.model_id = m.id)", kind: "num" },
      { ...updated, sql: "m.updated_at" },
    ],
    search: ["m.name", "m.provider_model_id", "p.name"],
    order: "m.id",
    conflict: "That provider already has a model with that id.",
  },

  providers: {
    slug: "providers", table: "llm_providers", title: "LLM providers", singular: "provider",
    blurb: "The companies whose APIs serve the models. The slug picks the code that calls the API: google (GEMINI_API_KEY) and openai (OPENAI_API_KEY) have code today. A model under any other provider is listed but never offered or run.",
    ops: { create: true, delete: true },
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 100, half: true },
      { name: "slug", label: "Slug", type: "slug", required: true, max: 40, mono: true, half: true },
    ],
    headingSql: "r.name",
    from: `public.llm_providers p`,
    idSql: "p.id",
    columns: [
      { key: "name", label: "Provider", sql: "p.name", kind: "link" },
      { key: "slug", label: "Slug", sql: "p.slug", kind: "mono" },
      { key: "models", label: "Models", sql: "(select count(*) from public.llm_models m where m.provider_id = p.id)", kind: "num" },
      { ...updated, sql: "p.updated_at" },
    ],
    search: ["p.name", "p.slug"],
    order: "p.id",
    conflict: "A provider with that name or slug already exists.",
  },

  domains: {
    slug: "domains", table: "allowed_signup_domains", title: "Allowed signup domains", singular: "domain",
    blurb: "Once any domain is listed, only Google accounts at these domains (or their subdomains) and the whitelisted emails can sign in. With none listed, anyone can. Superadmins are always let in.",
    ops: { create: true, delete: true },
    fields: [{ name: "domain", label: "Domain", type: "domain", required: true, max: 253, mono: true, hint: "Just the domain, e.g. columbia.edu." }],
    headingSql: "r.domain",
    from: `public.allowed_signup_domains d`,
    idSql: "d.id",
    columns: [
      { key: "domain", label: "Domain", sql: "d.domain", kind: "link" },
      { key: "created", label: "Added", sql: "d.created_at", kind: "ago" },
    ],
    search: ["d.domain"],
    order: "d.domain",
    conflict: "That domain is already allowed.",
  },

  whitelist: {
    slug: "whitelist", table: "whitelisted_emails", title: "Whitelisted emails", singular: "email address",
    blurb: "Individual addresses allowed to sign in even when their domain is not on the allowed list.",
    ops: { create: true, delete: true },
    fields: [{ name: "email", label: "Email address", type: "email", required: true, max: 320, mono: true }],
    headingSql: "r.email",
    from: `public.whitelisted_emails w`,
    idSql: "w.id",
    columns: [
      { key: "email", label: "Email", sql: "w.email", kind: "link" },
      { key: "created", label: "Added", sql: "w.created_at", kind: "ago" },
    ],
    search: ["w.email"],
    order: "w.email",
    conflict: "That address is already whitelisted.",
  },
};

export function getResource(slug: string): Resource | null {
  return Object.hasOwn(RESOURCES, slug) ? RESOURCES[slug] : null;
}
