import Link from "next/link";

import { num } from "@/lib/admin/format";

// A prompt shown collapsed, since system prompts run long.
export function PromptBlock({ label, text, open }: { label: string; text: string | null; open?: boolean }) {
  if (!text) return null;
  return (
    <details className="ad-prompt" open={open}>
      <summary>{label} <span className="ad-muted">· {text.length.toLocaleString()} chars</span></summary>
      <pre>{text}</pre>
    </details>
  );
}

// One model call in a trace, from a saved run (llm_responses) or a test run.
export type TraceItem = {
  position: number;
  stepName: string;
  model: string;
  temperature: number | string | null;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  durationMs: number;
  responseId?: number;
};

// A run, step by step: what each step was sent, already filled in, and what
// it answered. The last step's answer is the joke, so it opens by default.
export function Trace({ items, failedStep }: { items: TraceItem[]; failedStep?: string | null }) {
  return (
    <ol className="ad-steps">
      {items.map((t, i) => {
        const final = i === items.length - 1 && !failedStep;
        return (
          <li key={t.position} className={`ad-step${final ? " ad-step--final" : ""}`}>
            <span className="ad-step__num">{t.position}</span>
            <div className="ad-step__body">
              <div className="ad-step__head">
                <span className="ad-step__name">
                  {t.responseId ? <Link href={`/admin/pipeline/responses/${t.responseId}`}>{t.stepName}</Link> : t.stepName}
                </span>
                <span className="ad-badges">
                  <span className="ad-badge ad-badge--accent">{t.model}</span>
                  {t.temperature != null ? <span className="ad-badge">temp {String(t.temperature)}</span> : null}
                  <span className="ad-badge">{num(t.durationMs)} ms</span>
                </span>
              </div>
              <PromptBlock label="System prompt" text={t.systemPrompt} />
              <PromptBlock label="User prompt (as sent)" text={t.userPrompt} />
              <PromptBlock label={final ? "Response — the joke" : "Response"} text={t.response} open />
            </div>
          </li>
        );
      })}
      {failedStep ? (
        <li className="ad-step">
          <span className="ad-step__num">✕</span>
          <div className="ad-step__body"><span className="ad-step__name">{failedStep}</span><span className="ad-form-error">Did not finish.</span></div>
        </li>
      ) : null}
    </ol>
  );
}
