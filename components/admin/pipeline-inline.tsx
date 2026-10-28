"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import {
  createRowInline, deleteRowInline, moveStep, updateRowAction, type RowState,
} from "@/app/admin/pipeline/actions";
import { DeleteRowButton, RowForm } from "@/components/admin/pipeline-forms";
import type { Choice, ResolvedField, RowValues } from "@/lib/admin/pipeline/fields";

// Editing in place: a chain's steps as forms on the chain's own page, and the
// other tables' rows opening under themselves in their list. Every write goes
// through the same server actions, checks and config as the standalone forms.

// ---------- a chain's steps ----------

export type EditableStep = {
  id: number; position: number; name: string; model_id: number; temperature: string | null;
  system_prompt: string; user_prompt: string; version: string; saved: string; stats: string | null;
};

type StepValues = { name: string; model_id: string; temperature: string; system_prompt: string; user_prompt: string };

const valuesOf = (s: EditableStep): StepValues => ({
  name: s.name, model_id: String(s.model_id), temperature: s.temperature ?? "",
  system_prompt: s.system_prompt, user_prompt: s.user_prompt,
});

export function StepList({ chainId, steps, models, placeholders }:
  { chainId: number; steps: EditableStep[]; models: Choice[]; placeholders: string }) {
  const [adding, setAdding] = useState(false);
  const last = steps.at(-1);
  const blank: StepValues = {
    name: "", model_id: last ? String(last.model_id) : models[0]?.value ?? "", temperature: last?.temperature ?? "",
    system_prompt: "", user_prompt: last ? `{{step${last.position}}}` : "",
  };
  return (
    <section className="ad-card">
      <div className="ad-card__head">
        <div className="ad-card__title">Steps ({steps.length})</div>
        {adding ? null : <button className="ad-btn" onClick={() => setAdding(true)}>Add step</button>}
      </div>
      <p className="ad-field__hint" style={{ marginBottom: 14 }}>{placeholders} ⌘S saves the step you are typing in.</p>
      {steps.length || adding ? (
        <ol className="ad-steps">
          {steps.map((s, i) => (
            // Keyed on the saved version too: a save, a move or a rewrite of
            // {{stepN}} by a move re-seeds the form from the database.
            <StepEditor key={`${s.id}:${s.version}`} chainId={chainId} step={s} models={models}
              final={!adding && i === steps.length - 1} first={i === 0} lastStep={i === steps.length - 1} />
          ))}
          {adding ? (
            <StepEditor chainId={chainId} models={models} final first={false} lastStep
              position={(last?.position ?? 0) + 1} initial={blank} onDone={() => setAdding(false)} />
          ) : null}
        </ol>
      ) : (
        <p className="ad-empty">No steps yet, so the mix will never pick this chain. Add one.</p>
      )}
    </section>
  );
}

function StepEditor({ chainId, step, models, final, first, lastStep, position, initial, onDone }: {
  chainId: number; step?: EditableStep; models: Choice[]; final: boolean; first: boolean; lastStep: boolean;
  position?: number; initial?: StepValues; onDone?: () => void;
}) {
  const saved = step ? valuesOf(step) : initial!;
  const pos = step?.position ?? position!;
  const [v, setV] = useState<StepValues>(saved);
  const set = (k: keyof StepValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));
  const dirty = step ? (Object.keys(saved) as (keyof StepValues)[]).some((k) => saved[k] !== v[k]) : true;

  const [state, submit, pending] = useActionState<RowState, FormData>(
    step ? updateRowAction.bind(null, "steps", step.id) : async (prev: RowState, fd: FormData) => {
      const result = await createRowInline("steps", prev, fd);
      if (result.id) onDone?.();
      return result;
    }, {});
  const [moving, startMove] = useTransition();
  const [moveError, setMoveError] = useState<string | null>(null);
  const move = (dir: number) => startMove(async () => {
    setMoveError(null);
    const result = await moveStep(step!.id, dir);
    if (result.error) setMoveError(result.error);
  });

  return (
    <li className={`ad-step${final ? " ad-step--final" : ""}`} id={step ? `step-${step.id}` : undefined}>
      <span className="ad-step__num">{pos}</span>
      <form className="ad-step__body ad-step-edit" action={submit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); e.currentTarget.requestSubmit(); }
        }}>
        <input type="hidden" name="chain_id" value={chainId} />
        <input type="hidden" name="position" value={pos} />
        <div className="ad-step-edit__head">
          <input className="ad-input ad-step-edit__name" name="name" required maxLength={100} placeholder="Step name"
            value={v.name} onChange={set("name")} aria-label="Step name" />
          <select className="ad-select" name="model_id" required value={v.model_id} onChange={set("model_id")} aria-label="Model">
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <label className="ad-step-edit__temp">
            <span>temp</span>
            <input className="ad-input ad-num" type="number" name="temperature" min={0} max={2} step={0.05}
              placeholder="default" value={v.temperature} onChange={set("temperature")} />
          </label>
          <span className="ad-badge">{lastStep ? "→ joke" : "→ text"}</span>
        </div>
        <label className="ad-field">
          <span className="ad-field__label">System prompt</span>
          <textarea className="ad-textarea ad-mono ad-autogrow" name="system_prompt" required maxLength={20000} rows={3}
            spellCheck={false} value={v.system_prompt} onChange={set("system_prompt")} />
        </label>
        <label className="ad-field">
          <span className="ad-field__label">User prompt</span>
          <textarea className="ad-textarea ad-mono ad-autogrow" name="user_prompt" required maxLength={20000} rows={4}
            spellCheck={false} value={v.user_prompt} onChange={set("user_prompt")} />
        </label>
        <div className="ad-form-actions">
          <button className="ad-btn ad-btn--primary ad-btn--sm" disabled={pending || !dirty}>
            {pending ? "Saving…" : step ? "Save step" : "Add step"}
          </button>
          {step && dirty ? <button type="button" className="ad-btn ad-btn--sm" onClick={() => setV(saved)}>Revert</button> : null}
          {!step ? <button type="button" className="ad-btn ad-btn--sm" onClick={onDone}>Cancel</button> : null}
          <span className="ad-muted" style={{ fontSize: 12 }}>
            {step ? (dirty ? "Unsaved changes" : [step.saved, step.stats].filter(Boolean).join(" · ")) : "New step"}
          </span>
          <span className="ad-spacer" />
          {step ? (
            <>
              <button type="button" className="ad-btn ad-btn--sm" title="Move up" aria-label="Move up"
                disabled={first || moving || dirty} onClick={() => move(-1)}>↑</button>
              <button type="button" className="ad-btn ad-btn--sm" title="Move down" aria-label="Move down"
                disabled={lastStep || moving || dirty} onClick={() => move(1)}>↓</button>
              <DeleteStep id={step.id} />
            </>
          ) : null}
        </div>
        {state.error || moveError ? <p className="ad-form-error" role="alert">{state.error ?? moveError}</p> : null}
      </form>
    </li>
  );
}

// A button, not DeleteRowButton's form: it sits inside the step's form.
function DeleteStep({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="ad-btn ad-btn--danger ad-btn--sm" disabled={pending}
        onClick={() => {
          if (!confirm("Delete this step permanently?")) return;
          start(async () => {
            const result = await deleteRowInline("steps", id);
            if (result.error) setError(result.error);
          });
        }}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? <span className="ad-form-error" role="alert">{error}</span> : null}
    </>
  );
}

// ---------- list pages ----------

// "New …" that opens a form above the table instead of a page of its own.
// `openPrefix` sends the new row to its own page (a chain, to add steps to).
export function InlineCreate({ slug, singular, fields, values, openPrefix }: {
  slug: string; singular: string; fields: ResolvedField[]; values: RowValues; openPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const router = useRouter();
  if (!open) {
    return (
      <div className="ad-form-actions">
        {created ? <span className="ad-form-ok">Created.</span> : null}
        <button className="ad-btn ad-btn--primary" onClick={() => { setOpen(true); setCreated(false); }}>New {singular}</button>
      </div>
    );
  }
  return (
    <section className="ad-card ad-inline-new">
      <div className="ad-card__head"><div className="ad-card__title">New {singular}</div></div>
      <RowForm slug={slug} fields={fields} values={values} singular={singular} onCancel={() => setOpen(false)}
        onCreated={(id) => {
          if (openPrefix) router.push(`${openPrefix}${id}`);
          else { setOpen(false); setCreated(true); }
        }} />
    </section>
  );
}

// A table whose rows open into their edit form, in place.
export function ExpandableRows({ slug, singular, fields, rows, span, canDelete }: {
  slug: string; singular: string; fields: ResolvedField[]; span: number; canDelete: boolean;
  rows: { id: number; cells: React.ReactNode; values: RowValues; meta: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  return rows.map((row) => (
    <ExpandableRow key={row.id} row={row} open={open === row.id} toggle={() => setOpen(open === row.id ? null : row.id)}
      slug={slug} singular={singular} fields={fields} span={span} canDelete={canDelete} />
  ));
}

function ExpandableRow({ row, open, toggle, slug, singular, fields, span, canDelete }: {
  row: { id: number; cells: React.ReactNode; values: RowValues; meta: string }; open: boolean; toggle: () => void;
  slug: string; singular: string; fields: ResolvedField[]; span: number; canDelete: boolean;
}) {
  return (
    <>
      <tr className={`ad-row-toggle${open ? " is-open" : ""}`} onClick={toggle} aria-expanded={open}>
        <td className="ad-row-toggle__caret">
          <button type="button" className="ad-caret" aria-label={open ? "Close" : `Edit ${singular}`}
            onClick={(e) => { e.stopPropagation(); toggle(); }}>{open ? "▾" : "▸"}</button>
        </td>
        {row.cells}
      </tr>
      {open ? (
        <tr className="ad-row-editor">
          <td colSpan={span + 1}>
            <div className="ad-row-editor__inner">
              <RowForm slug={slug} id={row.id} fields={fields} values={row.values} singular={singular} />
              <div className="ad-row-editor__side">
                <span className="ad-muted" style={{ fontSize: 12 }}>{row.meta}</span>
                {canDelete ? <DeleteRowButton slug={slug} id={row.id} singular={singular} inline small /> : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
