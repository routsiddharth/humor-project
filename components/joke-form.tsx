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

      <div className="form__row">
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
        </div>

        <div className="field field--narrow">
          <label className="label" htmlFor="rating">
            Rating
          </label>
          <select
            id="rating"
            name="rating"
            className="input"
            defaultValue="3"
            required
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {"★".repeat(value)}
              </option>
            ))}
          </select>
        </div>
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
