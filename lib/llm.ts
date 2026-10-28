import "server-only";

import { GoogleGenAI, Type } from "@google/genai";

// One model call, whichever provider serves it. The models themselves live in
// llm_models / llm_providers (0013) and are edited in the admin panel; this file
// only knows how to talk to each provider *kind*, keyed by llm_providers.slug.
//
// Providers with code today: google (GEMINI_API_KEY) and openai (OPENAI_API_KEY).
//
// API keys are server-only, on the same rule as SUPABASE_SECRET_KEY: no
// NEXT_PUBLIC_ prefix, and the `server-only` import above turns an accidental
// Client Component import into a build error rather than a leaked key.

export type ModelRef = {
  id: number;
  name: string;
  provider: string; // llm_providers.slug
  providerModelId: string;
  supportsTemperature: boolean;
};

export type CallInput = {
  system: string;
  user: string;
  temperature: number | null;
  // The last step of a chain answers with the setup/punchline object; every
  // other step answers in prose.
  json: boolean;
};

export type CallResult = {
  text: string;
  // The model that actually served the request, which can differ from the id
  // asked for (an alias resolves to something concrete).
  served: string;
};

// Structured output rather than parsing prose. Without it the model narrates
// ("Sure! Here's a joke:") and the setup/punchline split becomes a
// string-splitting problem with no reliable separator.
const JOKE_SCHEMA = {
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
let google: GoogleGenAI | null = null;

function getGoogle(): GoogleGenAI {
  if (!google) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set — see .env");
    google = new GoogleGenAI({ apiKey });
  }
  return google;
}

// Per call. A model under load does not always refuse fast: a Gemini call was
// measured hanging 136 seconds before it answered, which held a press of
// Generate for over two and a half minutes. Past this, the call is abandoned and
// counts as a bad answer, so the next model gets its turn.
const CALL_TIMEOUT_MS = 30_000;

async function callGoogle(model: ModelRef, input: CallInput): Promise<CallResult> {
  const response = await getGoogle().models.generateContent({
    model: model.providerModelId,
    contents: input.user,
    config: {
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      systemInstruction: input.system,
      ...(input.temperature != null && model.supportsTemperature ? { temperature: input.temperature } : {}),
      ...(input.json ? { responseMimeType: "application/json", responseSchema: JOKE_SCHEMA } : {}),
    },
  });
  const text = response.text;
  if (!text?.trim()) throw new Error("The model returned an empty response.");
  return { text, served: response.modelVersion ?? model.providerModelId };
}

// Chat Completions over plain fetch rather than another SDK: one endpoint, and
// the error body already carries the status the fallback logic keys on.
// `strict` JSON schema is the same guarantee Gemini's responseSchema gives.
const OPENAI_JOKE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "joke",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["setup", "punchline"],
      properties: { setup: { type: "string" }, punchline: { type: "string" } },
    },
  },
};

class ProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function callOpenAI(model: ModelRef, input: CallInput): Promise<CallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ProviderError("OPENAI_API_KEY is not set — see .env", 401);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.providerModelId,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      // The newest OpenAI models refuse any temperature but their default with
      // a 400, which is what supports_temperature on the model row is for.
      ...(input.temperature != null && model.supportsTemperature ? { temperature: input.temperature } : {}),
      ...(input.json ? { response_format: OPENAI_JOKE_FORMAT } : {}),
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as {
    model?: string;
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new ProviderError(body?.error?.message ?? `OpenAI answered ${response.status}.`, response.status);
  }
  const message = body?.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`The model refused: ${message.refusal}`);
  const text = message?.content;
  if (!text?.trim()) throw new Error("The model returned an empty response.");
  return { text, served: body?.model ?? model.providerModelId };
}

const ADAPTERS: Record<string, (model: ModelRef, input: CallInput) => Promise<CallResult>> = {
  google: callGoogle,
  openai: callOpenAI,
};

// Which environment variable holds each provider's key. A provider whose key
// is unset is left out of the Generate picker rather than offered and failed.
const KEYS: Record<string, string> = {
  google: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};

export function isConfigured(provider: string): boolean {
  return Object.hasOwn(ADAPTERS, provider) && Boolean(process.env[KEYS[provider]]);
}

// Thrown when the configuration asks for something no code can serve. Fatal:
// trying the next model would not help when the provider itself is unknown.
export class UnsupportedProviderError extends Error {
  status = 400;
}

export function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

// A malformed request or a bad key fails the same way on every model, so those
// abort instead of walking the fallback list and burning seconds first.
// Everything else — capacity, quota, a model retired out from under us, a
// malformed answer — moves along to the next model.
const FATAL_STATUSES = new Set([400, 401, 403]);

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
const coolingUntil = new Map<number, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function available(models: ModelRef[], now: number): ModelRef[] {
  const ready = models.filter((m) => (coolingUntil.get(m.id) ?? 0) <= now);
  // If everything is cooling, ignore the hint rather than refuse to try: a
  // stale cooldown must never be the reason a request fails.
  return ready.length ? ready : models;
}

// Calls `models[0]`, falling back through the rest. `accept` turns the raw
// text into the caller's value or throws, and a throw there counts as a bad
// answer from that model — the next one gets a turn.
export async function callWithFallback<T>(
  models: ModelRef[],
  input: CallInput,
  accept: (text: string) => T,
): Promise<{ value: T; text: string; served: string; model: ModelRef }> {
  let lastError: unknown = null;

  // Two passes. The first takes whichever model is not known to be shedding
  // load; the second waits a beat and tries the full list, because a 503 here
  // means "demand spike" and those clear on their own.
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(700);

    for (const model of pass === 0 ? available(models, Date.now()) : models) {
      const adapter = ADAPTERS[model.provider];
      if (!adapter) {
        throw new UnsupportedProviderError(
          `${model.name} is served by "${model.provider}", which this site has no code to call. Point the step at a Google or OpenAI model.`,
        );
      }
      try {
        const { text, served } = await adapter(model, input);
        const value = accept(text);
        coolingUntil.delete(model.id);
        return { value, text, served, model };
      } catch (error) {
        lastError = error;
        const status = statusOf(error);
        if (status !== null && FATAL_STATUSES.has(status)) throw error;
        // Capacity and quota are the statuses worth remembering. A malformed
        // answer from an otherwise healthy model is not — that is this
        // request's problem, not the model's.
        if (status === 429 || status === 500 || status === 502 || status === 503) {
          coolingUntil.set(model.id, Date.now() + COOLDOWN_MS);
        }
      }
    }
  }

  throw lastError ?? new Error("Could not reach the model.");
}
