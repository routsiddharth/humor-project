import type { Step } from "@/lib/admin/study/read";

// A prompt shown collapsed, since system prompts run to pages.
export function PromptBlock({ label, text, open }: { label: string; text: string | null; open?: boolean }) {
  if (!text) return null;
  return (
    <details className="ad-prompt" open={open}>
      <summary>{label} <span className="ad-muted">· {text.length.toLocaleString()} chars</span></summary>
      <pre>{text}</pre>
    </details>
  );
}

export function StepMeta({ s }: { s: Step }) {
  return (
    <span className="ad-badges">
      <span className="ad-badge">{s.step_type}</span>
      <span className="ad-badge">{s.input_type} → {s.output_type}</span>
      <span className="ad-badge ad-badge--accent">{s.model}</span>
      {s.llm_temperature != null ? <span className="ad-badge">temp {s.llm_temperature}</span> : null}
      {s.is_hidden ? <span className="ad-badge">hidden</span> : null}
    </span>
  );
}

// External image URLs from the snapshot; some are long dead. size 0 fills
// the container's width at a 4:3 crop.
export function Thumb({ url, size = 56 }: { url: string | null; size?: number }) {
  return (
    <span className={`ad-thumb${size ? "" : " ad-thumb--fill"}`} style={size ? { width: size, height: size } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" /> : null}
    </span>
  );
}
