"use client";

import { useActionState, useEffect, useState } from "react";

import type { JokeFormState } from "@/app/submit/actions";
import { IMAGE_ACCEPT, KINDS } from "@/lib/memes";
import type { JokeKind } from "@/lib/types";

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
  const [kind, setKind] = useState<JokeKind>("text");
  const [preview, setPreview] = useState<string | null>(null);

  const isMeme = kind === "image";

  // Object URLs leak until revoked.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function dropPreview() {
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  return (
    <form action={formAction} className="form">
      {/* Radio buttons rather than a toggle, so `kind` posts itself and the
          Server Action reads it from FormData like every other field. */}
      <fieldset className="field--group">
        <legend className="label">What are you posting?</legend>
        <div className="segmented">
          {KINDS.map((option) => (
            <label
              key={option.value}
              className={`segmented__option${
                kind === option.value ? " segmented__option--on" : ""
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => {
                  setKind(option.value);
                  // The file input below unmounts with the image fields, so
                  // its preview has to go with it.
                  if (option.value !== "image") dropPreview();
                }}
                className="segmented__input"
              />
              {option.formLabel}
            </label>
          ))}
        </div>
      </fieldset>

      {/* The two halves are unmounted rather than hidden, so FormData only
          carries the fields that belong to the kind being posted. A meme has
          no text fields at all: whatever it says is in the picture. */}
      {isMeme ? (
        <>
          <div className="field">
            <label className="label" htmlFor="image">
              Image
            </label>
            {preview ? (
              <span className="media-preview">
                {/* Local object URL, so no Storage round trip to show it. */}
                <img src={preview} alt="" />
              </span>
            ) : null}
            <input
              id="image"
              name="image"
              type="file"
              accept={IMAGE_ACCEPT}
              className="input input--file"
              onChange={onFileChange}
              required
            />
            <p className="field__hint">PNG, JPEG, WebP or GIF, up to 5 MB.</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="image_alt">
              Image description <span className="label__aside">optional</span>
            </label>
            <input
              id="image_alt"
              name="image_alt"
              className="input"
              maxLength={280}
              placeholder="A cat staring at a laptop, unimpressed"
            />
            <p className="field__hint">
              What the picture shows, including any words in it. There is no
              caption to fall back on, so this is the only part a screen reader
              can read.
            </p>
          </div>
        </>
      ) : (
        <>
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
            <p className="field__hint">Hidden on the card until someone taps it.</p>
          </div>
        </>
      )}

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
        {pending
          ? isMeme
            ? "Uploading…"
            : "Posting…"
          : isMeme
            ? "Post meme"
            : "Post joke"}
      </button>
    </form>
  );
}
