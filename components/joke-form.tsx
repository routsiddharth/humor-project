"use client";

import { useActionState } from "react";

import type { JokeFormState } from "@/app/submit/actions";

export function JokeForm({
  submitAction,
  categories,
}: {
  submitAction: (
    state: JokeFormState,
    formData: FormData,
  ) => Promise<JokeFormState>;
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(submitAction, {});

  return (
    <form action={formAction} className="form">
      <div className="field">
        <label className="label" htmlFor="setup">
          Setup
        </label>
        <input
          id="setup"
          name="setup"
          className="input"
          maxLength={280}
          placeholder="Why do programmers prefer dark mode?"
          required
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="punchline">
          Punchline
        </label>
        <input
          id="punchline"
          name="punchline"
          className="input"
          maxLength={280}
          placeholder="Because light attracts bugs."
          required
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="category">
          Category
        </label>
        {/* Free text with suggestions, so the seeded categories stay
            consistent without locking out new ones. */}
        <input
          id="category"
          name="category"
          className="input"
          list="joke-categories"
          maxLength={40}
          placeholder="Programming"
          required
        />
        <datalist id="joke-categories">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <p className="field__hint">
          No rating to pick — the stars come from what readers vote.
        </p>
      </div>

      {state.error ? (
        <p className="field__error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn--primary" disabled={pending}>
        {pending ? "Posting…" : "Post joke"}
      </button>
    </form>
  );
}
