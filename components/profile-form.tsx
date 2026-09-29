"use client";

import { useActionState, useEffect, useState } from "react";

import type { ProfileFormState } from "@/app/profile/actions";

type Props = {
  // Named with the Action suffix per the Next.js convention for Server
  // Functions passed across the server/client boundary.
  submitAction: (
    state: ProfileFormState,
    formData: FormData,
  ) => Promise<ProfileFormState>;
  firstName: string;
  lastName: string;
  initials: string;
  currentAvatarUrl: string | null;
  submitLabel: string;
  showAvatar?: boolean;
  next?: string;
};

export function ProfileForm({
  submitAction,
  firstName,
  lastName,
  initials,
  currentAvatarUrl,
  submitLabel,
  showAvatar = true,
  next,
}: Props) {
  const [state, formAction, pending] = useActionState(submitAction, {});
  const [preview, setPreview] = useState<string | null>(null);

  // Object URLs leak until revoked.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  const shown = preview ?? currentAvatarUrl;

  return (
    <form action={formAction} className="form">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {showAvatar ? (
        <div className="avatar-field">
          <span className="avatar avatar--lg" aria-hidden="true">
            {/* Plain <img>: the source is a Storage CDN URL, and wiring
                next/image remotePatterns would make the build depend on the
                Supabase host being set at build time. */}
            {shown ? <img src={shown} alt="" /> : initials}
          </span>
          <div className="avatar-field__control">
            <label className="label" htmlFor="avatar">
              Profile photo
            </label>
            <input
              id="avatar"
              name="avatar"
              type="file"
              accept="image/*"
              className="input input--file"
              onChange={onFileChange}
            />
            <p className="field__hint">PNG, JPG or WebP, up to 5 MB.</p>
          </div>
        </div>
      ) : null}

      <div className="form__row">
        <div className="field">
          <label className="label" htmlFor="first_name">
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            className="input"
            defaultValue={firstName}
            maxLength={60}
            autoComplete="given-name"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="last_name">
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            className="input"
            defaultValue={lastName}
            maxLength={60}
            autoComplete="family-name"
            required
          />
        </div>
      </div>

      {state.error ? (
        <p className="field__error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="field__ok" role="status">
          {state.ok}
        </p>
      ) : null}

      <button type="submit" className="btn btn--primary" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
