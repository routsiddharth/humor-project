import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, JokeText, SourceBadge, Stars } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, dateTime, fixed, fullName } from "@/lib/admin/format";
import { getUser } from "@/lib/admin/users";

export const metadata = { title: "User · Humor Admin" };

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const data = await getUser(id);
  if (!data) notFound();
  const { user: u, posts, ratings, generations } = data;
  const posted = generations.filter((g) => g.posted_id).length;

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/users">Users</Link> /</div>
      <div className="ad-page-head">
        <div className="ad-person">
          <Avatar first={u.first_name} last={u.last_name} path={u.avatar_path} size="lg" />
          <div>
            <h1>{u.first_name ? fullName(u.first_name, u.last_name) : "Not onboarded"} {u.is_superadmin ? <span className="ad-badge ad-badge--accent">superadmin</span> : null}</h1>
            <p>{u.email}</p>
          </div>
        </div>
      </div>

      <div className="ad-grid ad-grid--wide-left">
        <div className="ad-tiles">
          <div className="ad-tile"><div className="ad-tile__label">Posts</div><div className="ad-tile__value">{u.posts}</div><div className="ad-tile__meta">{u.ai_posts} AI-written</div></div>
          <div className="ad-tile"><div className="ad-tile__label">Ratings given</div><div className="ad-tile__value">{u.ratings}</div><div className="ad-tile__meta">{u.avg_given ? `${fixed(u.avg_given)}★ average` : "—"}</div></div>
          <div className="ad-tile"><div className="ad-tile__label">Showdown votes</div><div className="ad-tile__value">{u.votes}</div></div>
          <div className="ad-tile"><div className="ad-tile__label">Gemini calls</div><div className="ad-tile__value">{u.generations}</div><div className="ad-tile__meta">{posted} posted</div></div>
        </div>
        <section className="ad-card">
          <dl className="ad-facts">
            <dt>User id</dt><dd className="ad-mono">{u.id}</dd>
            <dt>Sign-in</dt><dd>{u.provider ?? "—"}</dd>
            <dt>Joined</dt><dd>{dateTime(u.created_at)}</dd>
            <dt>Last sign-in</dt><dd>{dateTime(u.last_sign_in_at)} <span className="ad-muted">({ago(u.last_sign_in_at)})</span></dd>
          </dl>
        </section>
      </div>

      <h2 className="ad-section-title">Posts</h2>
      <section className="ad-card ad-card--flush">
        {posts.length ? (
          <div className="ad-table-wrap">
            <table>
              <thead><tr><th>Post</th><th>Source</th><th>Category</th><th>Stars</th><th className="ad-r">Elo</th><th>Posted</th></tr></thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td className="ad-clip">
                      {p.source === "ai"
                        ? <Link className="ad-row-link" href={`/admin/media/${p.id}`}><JokeText setup={p.setup} punchline={p.punchline} /></Link>
                        : <JokeText setup={p.setup} punchline={p.punchline} />}
                    </td>
                    <td><SourceBadge source={p.source} /></td>
                    <td>{p.category}</td>
                    <td><Stars value={p.rating_avg} count={p.rating_count} /></td>
                    <td className="ad-r">{p.elo ? Math.round(p.elo) : "—"}</td>
                    <td>{ago(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="ad-empty">No posts.</p>}
      </section>

      <div className="ad-grid ad-grid--2" style={{ marginTop: 16 }}>
        <section className="ad-card ad-card--flush">
          <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Ratings given</div></div>
          {ratings.length ? (
            <div className="ad-table-wrap">
              <table>
                <tbody>
                  {ratings.map((r) => (
                    <tr key={r.joke_id}>
                      <td className="ad-clip"><JokeText setup={r.setup} /></td>
                      <td><span className="ad-stars__on">{"★".repeat(r.rating)}</span><span className="ad-stars__off">{"★".repeat(5 - r.rating)}</span></td>
                      <td className="ad-muted">{ago(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="ad-empty">No ratings.</p>}
        </section>
        <section className="ad-card ad-card--flush">
          <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Gemini generations</div></div>
          {generations.length ? (
            <div className="ad-table-wrap">
              <table>
                <tbody>
                  {generations.map((g) => (
                    <tr key={g.id}>
                      <td>{g.prompt ? `“${g.prompt}”` : <span className="ad-muted">no topic</span>}<div className="ad-person__sub">{g.category} · {g.model}</div></td>
                      <td>{g.posted_id ? <Link className="ad-badge" href={`/admin/media/${g.posted_id}`}>posted</Link> : <span className="ad-badge">discarded</span>}</td>
                      <td className="ad-muted">{ago(g.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="ad-empty">Never used Generate.</p>}
        </section>
      </div>
    </>
  );
}
