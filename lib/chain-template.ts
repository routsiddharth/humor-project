// The placeholder language of prompt chain steps (0013). Pure and free of
// server-only imports: the runner fills templates with it, and the admin panel
// checks a step's prompts with it before saving, so a typo is refused at the
// form instead of failing a user's press of Generate.

// What every step can use, with the help text the admin step form shows.
export const PLACEHOLDERS = {
  category: "The category the user picked.",
  topic: "What the user typed to steer it, or a note that they typed nothing.",
  avoid: "Setups already posted in the category, one per line.",
  terms: "The comedic techniques from Terms, highest priority first.",
  examples: "Few-shot jokes from Generation examples for this category.",
} as const;

// {{step1}} … {{stepN}}: the text an earlier step answered with.
export const STEP_PLACEHOLDER = /^step([1-9][0-9]?)$/;

const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

// Every placeholder in `text` that a step at `position` cannot use, as a
// readable problem, or null when the template is fine.
export function checkTemplate(text: string, position: number): string | null {
  for (const [, name] of text.matchAll(TOKEN)) {
    if (Object.hasOwn(PLACEHOLDERS, name)) continue;
    const step = name.match(STEP_PLACEHOLDER);
    if (step) {
      if (Number(step[1]) < position) continue;
      return `{{${name}}} is not available at step ${position} — a step can only read steps before it.`;
    }
    return `{{${name}}} is not a placeholder. Use one of ${[...Object.keys(PLACEHOLDERS), "step1…"].map((p) => `{{${p}}}`).join(", ")}.`;
  }
  return null;
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN, (whole, name: string) => (Object.hasOwn(values, name) ? values[name] : whole));
}
