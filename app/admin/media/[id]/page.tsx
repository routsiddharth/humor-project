import Link from "next/link";
import { notFound } from "next/navigation";

import { SourceBadge, Stars } from "@/components/admin/bits";
import { DeleteButton, EditForm } from "@/components/admin/media-forms";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, dateTime, fullName } from "@/lib/admin/format";
import { getAiJoke, listCategories } from "@/lib/admin/media";

export const metadata = { title: "AI joke · Humor Admin" };

export default async function MediaItemPage({ params, searchParams }: PageProps<"/admin/media/[id]">) {
  await requireAdmin();
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [data, categories, sp] = await Promise.all([getAiJoke(id), listCategories(), searchParams]);
  if (!data) notFound();
  const { joke: j, ratings, matches, generation } = data;

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/media">AI media</Link> / #{j.id}</div>
      <div className="ad-page-head">
        <div>
          <h1>AI joke #{j.id}</h1>
          <p>Posted {dateTime(j.created_at)} by {j.author_id ? <Link href={`/admin/users/${j.author_id}`} className="ad-row-link">{fullName(j.first_name, j.last_name)}</Link> : "—"}</p>
        </div>
        <DeleteButton id={j.id} ratings={ratings.length} matches={matches.length} />
      </div>

      {sp.created ? <div className="ad-notice">Published. It is live on the board now.</div> : null}

      <div className="ad-grid ad-grid--wide-left">
        <div className="ad-stack">
          <section className="ad-card">
            <div className="ad-quote">
              <p>{j.setup}</p>
              <p>{j.punchline}</p>
            </div>
          </section>
          <section className="ad-card">
            <div className="ad-card__head"><div className="ad-card__title">Edit</div></div>
            <EditForm
              id={j.id}
              categories={categories}
              initial={{ setup: j.setup, punchline: j.punchline, category: j.category, prompt: j.prompt ?? "", model: j.model }}
            />
          </section>
        </div>

        <div className="ad-stack">
          <section className="ad-card">
            <dl className="ad-facts">
              <dt>Stars</dt><dd><Stars value={j.rating_avg} count={j.rating_count} /></dd>
              <dt>Showdown</dt><dd>{j.elo ? <>{Math.round(j.elo)} Elo · {j.wins}–{j.losses}</> : <span className="ad-muted">unranked</span>}</dd>
              <dt>Model</dt><dd className="ad-mono">{j.model}</dd>
              <dt>Ledger</dt><dd>{j.generation_id ? <>#{j.generation_id} · {dateTime(generation?.created_at)}</> : <span className="ad-muted">none (hand-entered or cleared)</span>}</dd>
            </dl>
            {generation && (generation.candidates[0]?.setup !== j.setup || generation.candidates[0]?.punchline !== j.punchline) ? (
              <div style={{ marginTop: 14, fontSize: 13 }}>
                <div className="ad-muted" style={{ fontSize: 12, marginBottom: 4 }}>Edited since generation. Gemini originally wrote:</div>
                <div className="ad-joke"><span className="ad-joke__setup">{generation.candidates[0]?.setup}</span> <span className="ad-joke__punch">{generation.candidates[0]?.punchline}</span></div>
              </div>
            ) : null}
          </section>

          <section className="ad-card ad-card--flush">
            <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Star ratings ({ratings.length})</div></div>
            {ratings.length ? (
              <table>
                <tbody>
                  {ratings.map((r) => (
                    <tr key={r.user_id}>
                      <td><Link href={`/admin/users/${r.user_id}`}>{fullName(r.first_name, r.last_name)}</Link></td>
                      <td><span className="ad-stars__on">{"★".repeat(r.rating)}</span><span className="ad-stars__off">{"★".repeat(5 - r.rating)}</span></td>
                      <td className="ad-muted">{ago(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="ad-empty">No ratings yet.</p>}
          </section>

          <section className="ad-card ad-card--flush">
            <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Showdown matches ({matches.length})</div></div>
            {matches.length ? (
              <table>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.id}>
                      <td><span className={`ad-badge${m.won ? " ad-badge--accent" : ""}`}>{m.won ? "Won" : "Lost"}</span></td>
                      <td className="ad-clip">vs {m.opp_setup ?? "—"} <SourceBadge source={m.opp_source} /></td>
                      <td className="ad-muted">{ago(m.voted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="ad-empty">Never drawn in Showdown.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
