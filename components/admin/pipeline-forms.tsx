"use client";

import { useActionState, useState } from "react";

import {
  createRow, deleteRowAction, testRunChain, updateRowAction, type RowState, type TestRunState,
} from "@/app/admin/pipeline/actions";
import { Trace } from "@/components/admin/pipeline-bits";
import { num } from "@/lib/admin/format";
import type { ResolvedField, RowValues } from "@/lib/admin/pipeline/fields";

type Set = (name: string, v: string | boolean) => void;

// Controlled, as in media-forms.tsx: React resets a form after its action
// runs, which would wipe what was typed whenever the server sends back an error.
function Input({ f, value, set }: { f: ResolvedField; value: string | boolean; set: Set }) {
  const cls = f.mono ? " ad-mono" : "";
  const str = String(value);
  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(f.name, e.target.value);
  switch (f.type) {
    case "bool":
      return (
        <label className="ad-check">
          <input type="checkbox" name={f.name} checked={value === true} onChange={(e) => set(f.name, e.target.checked)} />
          <span>{f.label}</span>
        </label>
      );
    case "textarea":
      return (
        <textarea className={`ad-textarea${cls}`} name={f.name} required={f.required} maxLength={f.max} rows={f.rows}
          value={str} onChange={onChange} spellCheck={f.mono ? false : undefined} />
      );
    case "select":
      return (
        <select className="ad-select ad-select--block" name={f.name} required={f.required} value={str} onChange={onChange}>
          {f.required ? (str === "" ? <option value="" disabled>Choose…</option> : null) : <option value="">None</option>}
          {f.choices?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      );
    case "int":
    case "decimal":
      return (
        <input className={`ad-input ad-num${cls}`} type="number" step={f.type === "int" ? 1 : 0.05} name={f.name}
          required={f.required} min={f.min} max={f.max} value={str} onChange={onChange} />
      );
    default:
      return (
        <input className={`ad-input${cls}`} type={f.type === "email" ? "email" : "text"} name={f.name}
          required={f.required} maxLength={f.max} value={str} onChange={onChange} spellCheck={f.mono ? false : undefined} />
      );
  }
}

function Fields({ fields, values, set }: { fields: ResolvedField[]; values: RowValues; set: Set }) {
  // Pair consecutive half-width fields into one row.
  const groups: ResolvedField[][] = [];
  for (const f of fields) {
    const last = groups.at(-1);
    if (f.half && last?.length === 1 && last[0].half) last.push(f);
    else groups.push([f]);
  }
  const one = (f: ResolvedField) =>
    f.type === "bool" ? (
      <div key={f.name} className="ad-field"><Input f={f} value={values[f.name]} set={set} /></div>
    ) : (
      <label key={f.name} className="ad-field">
        <span className="ad-field__label">{f.label}{f.required ? null : <span className="ad-muted"> (optional)</span>}</span>
        <Input f={f} value={values[f.name]} set={set} />
        {f.hint ? <span className="ad-field__hint">{f.hint}</span> : null}
      </label>
    );
  return groups.map((g) => (g.length === 2 ? <div key={g[0].name} className="ad-form-row">{g.map(one)}</div> : one(g[0])));
}

export function RowForm({ slug, id, fields, values, singular }:
  { slug: string; id?: number; fields: ResolvedField[]; values: RowValues; singular: string }) {
  const [current, setCurrent] = useState<RowValues>(values);
  const set: Set = (name, v) => setCurrent((prev) => ({ ...prev, [name]: v }));
  const action = id == null ? createRow.bind(null, slug) : updateRowAction.bind(null, slug, id);
  const [state, submit, pending] = useActionState<RowState, FormData>(action, {});
  return (
    <form className="ad-form" action={submit}>
      <Fields fields={fields} values={current} set={set} />
      <div className="ad-form-actions">
        <button className="ad-btn ad-btn--primary" disabled={pending}>
          {pending ? "Saving…" : id == null ? `Create ${singular}` : "Save changes"}
        </button>
        {state.ok ? <span className="ad-form-ok">{state.ok}</span> : null}
      </div>
      {state.error ? <p className="ad-form-error" role="alert">{state.error}</p> : null}
    </form>
  );
}

export function DeleteRowButton({ slug, id, singular }: { slug: string; id: number; singular: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async () => {
        const result = await deleteRowAction(slug, id);
        setPending(false);
        if (result?.error) setError(result.error);
      }}
      onSubmit={(e) => {
        if (!confirm(`Delete this ${singular} permanently?`)) e.preventDefault();
        else { setError(null); setPending(true); }
      }}
    >
      <button className="ad-btn ad-btn--danger" disabled={pending}>{pending ? "Deleting…" : "Delete"}</button>
      {error ? <p className="ad-form-error" role="alert" style={{ maxWidth: 360 }}>{error}</p> : null}
    </form>
  );
}

// Runs the chain once and shows every step as it was sent and answered.
// Nothing is saved: no generation, no trace, no post.
export function TestRunForm({ chainId, categories, models }:
  { chainId: number; categories: string[]; models: { id: number; label: string }[] }) {
  const [category, setCategory] = useState(categories[0] ?? "");
  const [topic, setTopic] = useState("");
  const [model, setModel] = useState("auto");
  const [state, submit, pending] = useActionState<TestRunState, FormData>(testRunChain.bind(null, chainId), {});
  const items = state.trace ?? [];
  return (
    <div className="ad-form">
      <form className="ad-form" action={submit}>
        <div className="ad-form-row">
          <label className="ad-field">
            <span className="ad-field__label">Category</span>
            <input className="ad-input" name="category" list="ad-test-categories" required maxLength={40}
              value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="ad-test-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="ad-field">
            <span className="ad-field__label">Topic <span className="ad-muted">(optional)</span></span>
            <input className="ad-input" name="topic" maxLength={280} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
        </div>
        <label className="ad-field">
          <span className="ad-field__label">Model</span>
          <select className="ad-select ad-select--block" name="model" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="auto">Auto — each step on its own model, with fallback</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <div className="ad-form-actions">
          <button className="ad-btn ad-btn--accent" disabled={pending}>{pending ? "Running…" : "Run this chain"}</button>
          <span className="ad-muted" style={{ fontSize: 12 }}>Real model calls, nothing saved.</span>
          {!pending && state.totalMs != null ? <span className="ad-muted" style={{ fontSize: 12 }}>{num(state.totalMs)} ms total</span> : null}
        </div>
        {state.error ? <p className="ad-form-error" role="alert">{state.error}</p> : null}
      </form>
      {state.joke ? (
        <blockquote className="ad-quote"><p>{state.joke.setup}</p><p>{state.joke.punchline}</p></blockquote>
      ) : null}
      {items.length || state.failedStep ? <Trace items={items} failedStep={state.error ? state.failedStep : null} /> : null}
    </div>
  );
}
