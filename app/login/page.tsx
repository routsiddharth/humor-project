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
          {reasonFor(typeof params.next === "string" ? next : "")} Google is the only provider — no password to forget.
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

// The gated pages send visitors here with ?next=, so say what they were trying
// to do rather than greeting them with a bare "Sign in".
function reasonFor(next: string): string {
  if (next.startsWith("/showdown")) return "Sign in to play Showdown.";
  if (next.startsWith("/submit")) return "Sign in to post a joke or meme.";
  if (next.startsWith("/generate")) return "Sign in to generate a joke.";
  if (next.startsWith("/jokes") || next.startsWith("/people")) return "Sign in to rate posts.";
  return "Sign in to rate jokes and play Showdown.";
}
