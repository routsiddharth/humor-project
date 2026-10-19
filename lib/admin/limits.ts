// Mirrors humor-project's limits and the database constraints behind them.

// MAX_JOKE_CHARS matches TEXT_LIMIT in humor-project/app/submit/actions.ts.
export const MAX_JOKE_CHARS = 280;
// jokes_prompt_length_check and generations_prompt_length_check (0007).
export const MAX_PROMPT_CHARS = 280;
export const MAX_CATEGORY_CHARS = 40;
export const MAX_MODEL_CHARS = 80;
