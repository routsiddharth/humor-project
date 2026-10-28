"use client";

import { useActionState, useState } from "react";

import {
  generateDraft,
  postDraft,
  type GenerateState,
  type PostState,
} from "@/app/generate/actions";
import { DAILY_LIMIT, MAX_TOPIC_CHARS } from "@/lib/generate";

export type PickableModel = { id: number; label: string; provider: string };

export function GenerateForm({
  categories,
  used,
  models,
}: {
  categories: string[];
  used: number;
  // Active models whose provider has an API key on the server. Empty means
  // nothing can generate, which reads as a disabled button with an
  // explanation rather than a failed press.
  models: PickableModel[];
}) {
  const configured = models.length > 0;
  const initialGenerate: GenerateState = {};
  const initialPost: PostState = {};

  const [genState, generate, generating] = useActionState(
    generateDraft,
    initialGenerate,
  );
  const [postState, post, posting] = useActionState(postDraft, initialPost);

  // Controlled rather than uncontrolled, so pressing Generate a second time
  // keeps the category and topic you chose: React resets uncontrolled fields
  // once a form action settles.
  const [category, setCategory] = useState(categories[0] ?? "");
  const [topic, setTopic] = useState("");
  const [model, setModel] = useState("auto");

  const draft = genState.draft;
  // The action reports the quota back, because it does not revalidate this page.
  const remaining = genState.remaining ?? Math.max(0, DAILY_LIMIT - used);
  const exhausted = remaining <= 0;

  return (
    <>
      <form action={generate} className="form">
        <div className="field">
          <label className="label" htmlFor="category">
            Category
          </label>
          {/* Free text with suggestions, matching the submit form: the seeded
              categories stay consistent without locking out new ones. */}
          <input
            id="category"
            name="category"
            className="input"
            list="generate-categories"
            maxLength={40}
            placeholder="Programming"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            required
          />
          <datalist id="generate-categories">
            {categories.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label className="label" htmlFor="topic">
            About <span className="label__aside">optional</span>
          </label>
          <input
            id="topic"
            name="topic"
            className="input"
            maxLength={MAX_TOPIC_CHARS}
            placeholder="database indexes"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
          <p className="field__hint">
            Leave it empty and it picks its own angle. Whatever you type here is
            shown on the card.
          </p>
        </div>

        <div className="field">
          <label className="label" htmlFor="model">
            Model
          </label>
          <select
            id="model"
            name="model"
            className="input"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            <option value="auto">Auto — each step on its own model</option>
            {[...new Set(models.map((m) => m.provider))].map((provider) => (
              <optgroup key={provider} label={provider}>
                {models
                  .filter((m) => m.provider === provider)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="field__hint">
            Each joke comes out of a chain of prompts, several model calls in a
            row. Pick a model to run every one of them, or leave it on Auto.
          </p>
        </div>

        {genState.error ? (
          <p className="field__error" role="alert">
            {genState.error}
          </p>
        ) : null}

        {!configured ? (
          <p className="field__error" role="alert">
            No model has an API key on the server, so there is nothing to
            generate with.
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn--primary"
          disabled={generating || posting || exhausted || !configured}
        >
          {generating
            ? "Writing…"
            : draft
              ? "Generate another"
              : "Generate a joke"}
        </button>

        <p className="field__hint">
          {exhausted
            ? `No generations left in this 24-hour window.`
            : `${remaining} of ${DAILY_LIMIT} generations left today.`}
        </p>
      </form>

      {draft ? (
        <section className="draft" aria-live="polite">
          <h2 className="draft__title">Fresh off the model</h2>

          {/* The same card the feed renders, punchline already open: there is
              nothing to reveal to someone who is deciding whether to post it. */}
          <article className="card">
            <header className="card__head">
              <span className="chip">{draft.category}</span>
              <span className="chip chip--ai">AI · {draft.model}</span>
            </header>
            <p className="card__setup">{draft.setup}</p>
            <p className="card__punchline card__punchline--shown">
              {draft.punchline}
            </p>
          </article>

          {/* Only the id goes back. The joke text is re-read from the ledger
              server-side, so there is no hidden field here to tamper with. */}
          <form action={post} className="draft__actions">
            <input
              type="hidden"
              name="generationId"
              value={draft.generationId}
            />
            {postState.error ? (
              <p className="field__error" role="alert">
                {postState.error}
              </p>
            ) : null}
            <button
              type="submit"
              className="btn btn--primary btn--wide"
              disabled={posting || generating}
            >
              {posting ? "Posting…" : "Post it"}
            </button>
          </form>

          <p className="field__hint">
            Generating again replaces this one. Nothing reaches the feed until
            you post it.
          </p>
        </section>
      ) : null}
    </>
  );
}
