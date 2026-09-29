import { safeNext } from "@/lib/auth";
import { GoogleButton } from "@/components/google-button";

export const metadata = { title: "Sign in · humor-project" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="page page--narrow">
      <header className="page__head">
        <h1 className="page__title">Sign in</h1>
        <p className="page__sub">
          Google is the only provider — no password to forget.
        </p>
      </header>

      {error ? (
        <div className="notice notice--error" role="alert">
          <strong>Sign-in failed:</strong> {error}
        </div>
      ) : null}

      <div className="panel">
        <GoogleButton next={next} />
        <p className="panel__foot">
          Signing in creates a profile for you the first time, then asks for your
          name.
        </p>
      </div>
    </main>
  );
}
