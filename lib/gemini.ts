import "server-only";

import { GoogleGenAI, Type } from "@google/genai";

import { MAX_JOKE_CHARS } from "@/lib/generate";

// GEMINI_API_KEY is server-only, on the same rule as SUPABASE_SECRET_KEY: no
// NEXT_PUBLIC_ prefix, and the `server-only` import above turns an accidental
// Client Component import into a build error rather than a leaked key.

// Tried in order, and the order is measured rather than guessed: the newest
// flash models answered 503 "high demand" steadily while this was written, and
// gemini-2.5-flash — the obvious choice from memory — is retired outright (404).
// So the list keeps a preferred model in front of one that reliably serves. A
// 503 comes back in well under a second, which makes probing the better model
// cheaper than skipping it. GEMINI_MODEL pins one and skips the chain.
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ["gemini-3.8-flash", "gemini-3.1-flash-lite"];

// A malformed request or a bad key fails the same way on every model, so those
// abort the chain instead of walking it and burning four seconds first.
// Everything else — capacity, quota, a model retired out from under us — moves
// along to the next entry.
const FATAL_STATUSES = new Set([400, 401, 403]);

// The last clause is not decorative. Asked for a programming joke cold, the
// model returned "Why do programmers prefer dark mode? / Because light attracts
// bugs." — which is verbatim the first row seeded in 0001. The famous example is
// the likeliest completion, so it has to be pushed away from explicitly, and the
// caller also passes the setups already in the category as an avoid list.
const SYSTEM_INSTRUCTION = [
  "You write short two-part jokes for a joke board.",
  "The setup leads the reader one way; the punchline subverts it and lands on its own, with no explanation after it.",
  "No preamble, no commentary, no emoji, no hashtags, no surrounding quotation marks.",
  `Keep each line under ${MAX_JOKE_CHARS} characters.`,
  "Avoid the single most famous joke of whatever kind you are asked for — it is already posted. Find the angle nobody uses.",
].join(" ");

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    setup: { type: Type.STRING },
    punchline: { type: Type.STRING },
  },
  required: ["setup", "punchline"],
  propertyOrdering: ["setup", "punchline"],
};

// Lazy, deliberately. At module scope a missing key would throw while Next is
// collecting page data, which fails the Vercel *build* instead of the request —
// a confusing way to find out an environment variable is unset.
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set — see .env");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export type GeneratedJoke = {
  setup: string;
  punchline: string;
  // The model that actually answered, which is not necessarily MODELS[0]. This
  // is what gets stored, so the badge names the model that wrote the joke.
  model: string;
};

export type GenerateInput = {
  category: string;
  // What the user typed in the topic box, or null when they just pressed the
  // button — the normal case.
  topic: string | null;
  // Setups already posted in this category. Sent so the model can see what it
  // must not repeat; capped by the caller, not here.
  avoid: string[];
};

function buildRequest({ category, topic, avoid }: GenerateInput): string {
  const lines = [`Write one joke in the "${category}" category.`];
  if (topic) lines.push(`It should be about: ${topic}`);
  if (avoid.length) {
    lines.push(
      "",
      "These setups are already posted. Do not reuse them, rephrase them, or write their punchlines:",
      ...avoid.map((setup) => `- ${setup}`),
    );
  }
  return lines.join("\n");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

async function callModel(model: string, request: string): Promise<GeneratedJoke> {
  const response = await getClient().models.generateContent({
    model,
    contents: request,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // Structured output rather than parsing prose. Without it the model
      // narrates ("Sure! Here's a joke:") and the setup/punchline split becomes
      // a string-splitting problem with no reliable separator.
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error("The model returned an empty response.");

  // responseSchema constrains the shape, but it is still JSON over a wire and a
  // truncated response parses as nothing. Treated as a bad answer from this
  // model rather than a crash, so the chain can try the next one.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The model returned something that was not JSON.");
  }

  const setup = String((parsed as { setup?: unknown })?.setup ?? "").trim();
  const punchline = String((parsed as { punchline?: unknown })?.punchline ?? "").trim();

  if (!setup || !punchline) throw new Error("The model left half the joke out.");
  if (setup.length > MAX_JOKE_CHARS || punchline.length > MAX_JOKE_CHARS) {
    throw new Error("The model wrote past the length limit.");
  }

  // The model that served the request, which can differ from the alias asked
  // for (gemini-flash-latest resolves to something concrete).
  return { setup, punchline, model: response.modelVersion ?? model };
}

// How long a model that just answered 503/429 is skipped for. Measured, not
// guessed: probing a model that is shedding load costs about a second, and
// walking the whole list twice took a press of the button from 1.4s to nearly
// 8s. Remembering the refusal for a minute keeps the preferred model in the
// rotation without charging every user for its outage.
//
// Module memory, so this is per server instance and resets on a cold start.
// That is the right scope for a hint — it is an optimisation, not a budget, and
// nothing breaks when a fresh instance probes again.
const COOLDOWN_MS = 60_000;
const coolingUntil = new Map<string, number>();

function available(now: number): string[] {
  const ready = MODELS.filter((model) => (coolingUntil.get(model) ?? 0) <= now);
  // If everything is cooling, ignore the hint rather than refuse to try: a
  // stale cooldown must never be the reason a request fails.
  return ready.length ? ready : MODELS;
}

export async function generateJoke(input: GenerateInput): Promise<GeneratedJoke> {
  const request = buildRequest(input);
  let lastError: unknown = null;

  // Two passes. The first takes whichever preferred model is not known to be
  // shedding load; the second waits a beat and tries the full list, because a
  // 503 here means "demand spike" and those clear on their own.
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(700);

    for (const model of pass === 0 ? available(Date.now()) : MODELS) {
      try {
        const joke = await callModel(model, request);
        coolingUntil.delete(model);
        return joke;
      } catch (error) {
        lastError = error;
        const status = statusOf(error);
        if (status !== null && FATAL_STATUSES.has(status)) throw error;
        // Capacity and quota are the statuses worth remembering. A malformed
        // answer from an otherwise healthy model is not — that is this
        // request's problem, not the model's.
        if (status === 429 || status === 500 || status === 502 || status === 503) {
          coolingUntil.set(model, Date.now() + COOLDOWN_MS);
        }
      }
    }
  }

  throw lastError ?? new Error("Could not reach the model.");
}
