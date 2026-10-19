import Link from "next/link";

import { JokeText, Pager, pageParam, param, Stars } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, fullName } from "@/lib/admin/format";
import { listAiJokes, MEDIA_SORTS, PAGE_SIZE, type MediaSort } from "@/lib/admin/media";

export const metadata = { title: "AI media · Humor Admin" };

const SORT_LABELS: Record<MediaSort, string> = {
  newest: "Newest", oldest: "Oldest", stars: "Top rated", elo: "Highest Elo", votes: "Most rated",
};

export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const category = param(sp.category);
  const model = param(sp.model);
  const sortParam = param(sp.sort, "newest");
  const sort = (sortParam in MEDIA_SORTS ? sortParam : "newest") as MediaSort;
  const page = pageParam(sp.page);

  const { rows, total, categories, models } = await listAiJokes({ q, category, model, sort, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>AI media</h1>
          <p>Every Gemini-written joke on the board. Create, edit or delete them here; the public site picks up changes immediately.</p>
        </div>
        <div className="ad-form-actions">
          <div className="ad-tabs">
            <Link href="/admin/media" aria-current="page">Posts</Link>
            <Link href="/admin/media/generations">Generation ledger</Link>
          </div>
          <Link href="/admin/media/new" className="ad-btn ad-btn--primary">New AI joke</Link>
        </div>
      </div>

      {sp.deleted ? <div className="ad-notice">Deleted.</div> : null}

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Search setup, punchline or prompt" aria-label="Search" />
        <select className="ad-select" name="category" defaultValue={category} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="ad-select" name="model" defaultValue={model} aria-label="Model">
          <option value="">All models</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="ad-select" name="sort" defaultValue={sort} aria-label="Sort">
          {Object.entries(SORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="ad-btn">Apply</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr><th>Joke</th><th>Category</th><th>Model</th><th>Stars</th><th className="ad-r">Elo</th><th>Prompted by</th><th>Posted</th></tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id}>
                  <td className="ad-clip">
                    <Link href={`/admin/media/${j.id}`} className="ad-row-link"><JokeText setup={j.setup} punchline={j.punchline} /></Link>
                    {j.prompt ? <div className="ad-person__sub">prompt: “{j.prompt}”</div> : null}
                  </td>
                  <td>{j.category}</td>
                  <td className="ad-mono ad-muted" style={{ fontSize: 12 }}>{j.model}</td>
                  <td><Stars value={j.rating_avg} count={j.rating_count} /></td>
                  <td className="ad-r">{j.elo ? <>{Math.round(j.elo)}<div className="ad-person__sub">{j.wins}–{j.losses}</div></> : "—"}</td>
                  <td>{j.author_id ? <Link href={`/admin/users/${j.author_id}`}>{fullName(j.first_name, j.last_name)}</Link> : "—"}</td>
                  <td className="ad-muted">{ago(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No AI jokes match.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} path="/admin/media"
          params={{ ...(q && { q }), ...(category && { category }), ...(model && { model }), sort }} />
      </section>
    </>
  );
}
