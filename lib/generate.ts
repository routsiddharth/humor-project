// Shared limits for the generate flow.
//
// Deliberately free of server-only imports, and deliberately not in
// lib/chain.ts or app/generate/actions.ts.
// The form is a Client Component and needs these for its own maxLength and its
// own copy: lib/chain.ts is `server-only`, so importing from it would be a
// build error, and a "use server" module may only export async functions, so a
// plain constant cannot live there either.

// Generations per user per 24 hours. Calls cost money, and the ceiling is
// counted off `generations`, which has no delete policy (0007) — the number only
// goes up, so a user cannot clear it.
export const DAILY_LIMIT = 20;

// Matches TEXT_LIMIT in app/submit/actions.ts, so a generated joke fits the same
// card as a written one.
export const MAX_JOKE_CHARS = 280;

// Matches jokes_prompt_length_check and generations_prompt_length_check (0007).
export const MAX_TOPIC_CHARS = 280;
