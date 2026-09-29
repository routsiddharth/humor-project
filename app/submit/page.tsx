import { submitJoke } from "@/app/submit/actions";
import { JokeForm } from "@/components/joke-form";
import { requireCompleteProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Post a joke · humor-project" };

// The signed-in-only route. Anonymous visitors never see this page: proxy.ts
// bounces them to /login, and requireCompleteProfile() is the real check behind
// it in case the proxy is ever bypassed.
export default async function SubmitPage() {
  const { profile } = await requireCompleteProfile("/submit");

  // Suggestions for the category field, so submissions reuse existing names.
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("jokes")
    .select("category")
    .returns<{ category: string }[]>();
  const categories = [...new Set(rows?.map((row) => row.category) ?? [])].sort();

  return (
    <main className="page page--narrow">
      <header className="page__head">
        <h1 className="page__title">Post a joke</h1>
        <p className="page__sub">
          It goes straight to the front page, credited to {profile.first_name}.
        </p>
      </header>

      <div className="panel">
        <JokeForm submitAction={submitJoke} categories={categories} />
      </div>
    </main>
  );
}
