import { GenerateForm } from "@/components/generate-form";
import { requireCompleteProfile } from "@/lib/auth";
import { listPickableModels } from "@/lib/chain";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Generate a joke · humor-project" };

// Reads cookies for the session and counts this user's generations, so it
// renders per request rather than being frozen at build time.
export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  // The gate. proxy.ts bounces anonymous visitors; this is the authoritative
  // check and also catches a signed-in user who never finished onboarding.
  const { user } = await requireCompleteProfile("/generate");

  const supabase = await createClient();

  // Suggestions for the category field, so generations land in the categories
  // that already exist rather than inventing a parallel vocabulary.
  const { data: rows } = await supabase
    .from("jokes")
    .select("category")
    .returns<{ category: string }[]>();
  const categories = [...new Set(rows?.map((row) => row.category) ?? [])].sort();

  // The quota as of page load. The action returns an updated figure afterwards,
  // since generating deliberately does not re-render this page.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);

  // The picker's options: active models whose provider has code and a key.
  // Only what the form needs crosses to the client.
  const models = (await listPickableModels()).map((m) => ({
    id: m.id,
    label: m.name,
    provider: m.provider === "openai" ? "OpenAI" : m.provider === "google" ? "Google" : m.provider,
  }));

  return (
    <main className="page page--narrow">
      <header className="page__head">
        <h1 className="page__title">Generate a joke</h1>
        <p className="page__sub">
          Pick a category and press the button. What comes back is posted with an
          AI badge and rated by the same stars as everything else.
        </p>
      </header>

      <div className="panel">
        <GenerateForm
          categories={categories}
          used={count ?? 0}
          models={models}
        />
      </div>
    </main>
  );
}
