"use client";

import { useActionState, useState } from "react";

import { createRow, deleteRowAction, updateRowAction, type RowState } from "@/app/admin/study/actions";
import type { ResolvedField, RowValues } from "@/lib/admin/study/fields";

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
      return <textarea className={`ad-textarea${cls}`} name={f.name} required={f.required} maxLength={f.max} value={str} onChange={onChange} />;
    case "select":
      return (
        <select className="ad-select ad-select--block" name={f.name} required={f.required} value={str} onChange={onChange}>
          {f.required ? (str === "" ? <option value="" disabled>Choose…</option> : null) : <option value="">None</option>}
          {f.choices?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      );
    case "int":
      return <input className={`ad-input ad-num${cls}`} type="number" step={1} name={f.name} required={f.required} min={f.min} max={f.max} value={str} onChange={onChange} />;
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
