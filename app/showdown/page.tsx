import Link from "next/link";

import { Showdown } from "@/components/showdown";
import { requireCompleteProfile } from "@/lib/auth";
import { loadPair } from "@/lib/showdown-db";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Showdown · humor-project" };

// Issues (or resumes) a match for the signed-in voter, so it renders per
// request.
export const dynamic = "force-dynamic";

export default async function ShowdownPage() {
  // The gate. proxy.ts bounces anonymous visitors; this also catches a user
  // who never finished onboarding, and showdown_next_match checks both again.
  await requireCompleteProfile("/showdown");

  const supabase = await createClient();
  const first = await loadPair(supabase);

  return (
    <main className="page page--showdown">
      <header className="page__head showdown__head">
        <div>
          <h1 className="page__title">Showdown</h1>
          <p className="page__sub">
            Two jokes, no names, no badges. Pick the funnier one — you find out
            who wrote what afterwards.
          </p>
        </div>
        <Link href="/showdown/leaderboard" className="btn btn--ghost btn--sm">
          Leaderboard
        </Link>
      </header>

      <Showdown
        initialPair={"pair" in first ? first.pair : null}
        initialError={"error" in first ? first.error : null}
      />
    </main>
  );
}
