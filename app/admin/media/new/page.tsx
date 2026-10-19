import Link from "next/link";

import { CreateForm } from "@/components/admin/media-forms";
import { requireAdmin } from "@/lib/admin/dal";
import { listCategories } from "@/lib/admin/media";

export const metadata = { title: "New AI joke · Humor Admin" };

export default async function NewMediaPage() {
  await requireAdmin();
  const categories = await listCategories();
  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/media">AI media</Link> /</div>
      <div className="ad-page-head">
        <div>
          <h1>New AI joke</h1>
          <p>
            Draft one with Gemini — the same prompt and model chain as the public Generate page, logged to the
            ledger — then edit and publish. Or fill the fields in by hand. It is posted under your name.
          </p>
        </div>
      </div>
      <section className="ad-card" style={{ maxWidth: 720 }}>
        <CreateForm categories={categories} />
      </section>
    </>
  );
}
