import "server-only";

import type { Field } from "@/lib/admin/study/fields";

// The study tables the panel edits row by row. Each entry drives one list
// page, one create page and one edit page (app/admin/study/[resource]). Table
// names, column names and SQL fragments here are the only identifiers ever
// interpolated into a query — a resource slug from the URL is looked up in
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
  from: string;
  idSql: string;
  columns: Column[];
  search: string[];
  order: string;
};

export const OPTION_SOURCES: Record<string, string> = {
  term_types: `select id::text as value, name as label from public.term_types order by name`,
  providers: `select id::text as value, name as label from public.llm_providers order by name`,
  example_categories: `select id::text as value, name as label from public.caption_example_categories order by name`,
  flavors: `select id::text as value, slug as label from public.humor_flavors order by id desc`,
};

const SMALLINT = { min: -32768, max: 32767 };

const modified: Column = { key: "modified", label: "Modified", sql: "modified_datetime_utc", kind: "ago" };

export const RESOURCES: Record<string, Resource> = {
  terms: {
    slug: "terms", table: "terms", title: "Terms", singular: "term",
    blurb: "The glossary of slang and phrases the caption prompts can draw on. Higher priority terms are offered first.",
    ops: { create: true, delete: true },
    fields: [
      { name: "term", label: "Term", type: "text", required: true, max: 200, half: true },
      { name: "term_type_id", label: "Type", type: "select", options: "term_types", half: true },
      { name: "definition", label: "Definition", type: "textarea", required: true, max: 2000 },
      { name: "example", label: "Example", type: "textarea", required: true, max: 2000 },
      { name: "priority", label: "Priority", type: "int", required: true, default: "0", ...SMALLINT, half: true },
    ],
    from: `public.terms t left join public.term_types tt on tt.id = t.term_type_id`,
    idSql: "t.id",
    columns: [
      { key: "term", label: "Term", sql: "t.term", kind: "link" },
      { key: "type", label: "Type", sql: "tt.name" },
      { key: "definition", label: "Definition", sql: "t.definition", kind: "clip" },
      { key: "priority", label: "Priority", sql: "t.priority", kind: "num" },
      { ...modified, sql: "t.modified_datetime_utc" },
    ],
    search: ["t.term", "t.definition", "t.example"],
    order: "t.priority desc, t.term",
  },

  examples: {
    slug: "examples", table: "caption_examples", title: "Generation examples", singular: "example",
    blurb: "Few-shot examples fed to caption generation: an image description, a caption for it, and why it works.",
    ops: { create: true, delete: true },
    fields: [
      { name: "image_description", label: "Image description", type: "textarea", required: true, max: 4000 },
      { name: "caption", label: "Caption", type: "textarea", required: true, max: 2000 },
      { name: "explanation", label: "Why it works", type: "textarea", required: true, max: 4000 },
      { name: "caption_example_category_id", label: "Category", type: "select", options: "example_categories", half: true },
      { name: "priority", label: "Priority", type: "int", required: true, default: "0", ...SMALLINT, half: true },
      { name: "image_id", label: "Image id", type: "uuid", mono: true, hint: "Optional. The id of an image in AI media this example is about." },
    ],
    from: `public.caption_examples e left join public.caption_example_categories c on c.id = e.caption_example_category_id`,
    idSql: "e.id",
    columns: [
      { key: "caption", label: "Caption", sql: "e.caption", kind: "link" },
      { key: "image_description", label: "Image description", sql: "e.image_description", kind: "clip" },
      { key: "category", label: "Category", sql: "c.name" },
      { key: "priority", label: "Priority", sql: "e.priority", kind: "num" },
      { ...modified, sql: "e.modified_datetime_utc" },
    ],
    search: ["e.caption", "e.image_description", "e.explanation"],
    order: "e.priority desc, e.id desc",
  },

  models: {
    slug: "models", table: "llm_models", title: "LLM models", singular: "model",
    blurb: "Models a prompt chain step can run on. The provider model id is the exact string sent to the provider's API.",
    ops: { create: true, delete: true },
    fields: [
      { name: "name", label: "Display name", type: "text", required: true, max: 100, half: true },
      { name: "llm_provider_id", label: "Provider", type: "select", required: true, options: "providers", half: true },
      { name: "provider_model_id", label: "Provider model id", type: "text", required: true, max: 200, mono: true },
      { name: "is_temperature_supported", label: "Accepts a temperature setting", type: "bool" },
    ],
    from: `public.llm_models m join public.llm_providers p on p.id = m.llm_provider_id`,
    idSql: "m.id",
    columns: [
      { key: "name", label: "Model", sql: "m.name", kind: "link" },
      { key: "provider", label: "Provider", sql: "p.name" },
      { key: "provider_model_id", label: "Provider model id", sql: "m.provider_model_id", kind: "mono" },
      { key: "temperature", label: "Temperature", sql: "m.is_temperature_supported", kind: "bool" },
      { key: "steps", label: "Steps using it", sql: "(select count(*) from public.humor_flavor_steps s where s.llm_model_id = m.id)", kind: "num" },
      { ...modified, sql: "m.modified_datetime_utc" },
    ],
    search: ["m.name", "m.provider_model_id", "p.name"],
    order: "m.id",
  },

  providers: {
    slug: "providers", table: "llm_providers", title: "LLM providers", singular: "provider",
    blurb: "The companies whose APIs serve the models.",
    ops: { create: true, delete: true },
    fields: [{ name: "name", label: "Name", type: "text", required: true, max: 100 }],
    from: `public.llm_providers p`,
    idSql: "p.id",
    columns: [
      { key: "name", label: "Provider", sql: "p.name", kind: "link" },
      { key: "models", label: "Models", sql: "(select count(*) from public.llm_models m where m.llm_provider_id = p.id)", kind: "num" },
      { ...modified, sql: "p.modified_datetime_utc" },
    ],
    search: ["p.name"],
    order: "p.id",
  },

  mix: {
    slug: "mix", table: "humor_flavor_mix", title: "Prompt chain mix", singular: "mix entry",
    blurb: "Which prompt chains run when captions are generated, and how many captions each contributes.",
    ops: { create: false, delete: false },
    fields: [
      { name: "humor_flavor_id", label: "Prompt chain", type: "select", required: true, options: "flavors" },
      { name: "caption_count", label: "Captions per request", type: "int", required: true, min: 0, max: 100 },
    ],
    from: `public.humor_flavor_mix x join public.humor_flavors f on f.id = x.humor_flavor_id`,
    idSql: "x.id",
    columns: [
      { key: "flavor", label: "Prompt chain", sql: "f.slug", kind: "link" },
      { key: "caption_count", label: "Captions per request", sql: "x.caption_count", kind: "num" },
      { ...modified, sql: "x.modified_datetime_utc" },
    ],
    search: ["f.slug", "f.description"],
    order: "x.id",
  },

  domains: {
    slug: "domains", table: "allowed_signup_domains", title: "Allowed signup domains", singular: "domain",
    blurb: "Anyone with an email at one of these domains can sign up.",
    ops: { create: true, delete: true },
    fields: [{ name: "apex_domain", label: "Domain", type: "domain", required: true, max: 253, mono: true, hint: "Just the domain, e.g. columbia.edu." }],
    from: `public.allowed_signup_domains d`,
    idSql: "d.id",
    columns: [
      { key: "apex_domain", label: "Domain", sql: "d.apex_domain", kind: "link" },
      { key: "created", label: "Added", sql: "d.created_datetime_utc", kind: "ago" },
    ],
    search: ["d.apex_domain"],
    order: "d.apex_domain",
  },

  whitelist: {
    slug: "whitelist", table: "whitelist_email_addresses", title: "Whitelisted emails", singular: "email address",
    blurb: "Individual addresses allowed to sign up even when their domain is not on the allowed list.",
    ops: { create: true, delete: true },
    fields: [{ name: "email_address", label: "Email address", type: "email", required: true, max: 320, mono: true }],
    from: `public.whitelist_email_addresses w`,
    idSql: "w.id",
    columns: [
      { key: "email_address", label: "Email", sql: "w.email_address", kind: "link" },
      { key: "created", label: "Added", sql: "w.created_datetime_utc", kind: "ago" },
    ],
    search: ["w.email_address"],
    order: "w.email_address",
  },
};

export function getResource(slug: string): Resource | null {
  return Object.hasOwn(RESOURCES, slug) ? RESOURCES[slug] : null;
}
