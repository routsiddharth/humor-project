import { redirect } from "next/navigation";

import { GoogleButton } from "@/components/google-button";
import { getUser } from "@/lib/auth";
import { HOME } from "@/lib/routes";

// Reads cookies to decide whether to bounce, so it renders per request.
export const dynamic = "force-dynamic";

export default async function Landing() {
  // Signed-in visitors have no use for the pitch.
  if (await getUser()) redirect(HOME);

  return (
    <main className="landing">
      <section className="landing__pitch">
        <p className="landing__eyebrow">humor-project</p>
        <h1 className="landing__title">
          Every punchline
          <br />
          is behind the door.
        </h1>
        <p className="landing__lede">
          A small, well-kept pile of setups and punchlines. Sign in to read
          them, rate them, and leave one of your own.
        </p>

        <div className="landing__cta">
          <GoogleButton next={HOME} />
        </div>

        <p className="landing__note">
          Google only — nothing to remember, no password to lose.
        </p>
      </section>

      {/* Decorative, and hard-coded on purpose: the landing page is the one
          route that reads no data, so it stays fast and works signed out even
          though the jokes table is now readable only by authenticated roles. */}
      <aside className="landing__demo" aria-hidden="true">
        <article className="card card--demo">
          <header className="card__head">
            <span className="chip">Programming</span>
          </header>
          <p className="card__setup">Why do programmers prefer dark mode?</p>
          <p className="card__locked">
            <span className="card__locked-text">Because light attracts bugs.</span>
            <span className="card__locked-badge">locked</span>
          </p>
        </article>
      </aside>
    </main>
  );
}
