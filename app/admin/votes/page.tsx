import Link from "next/link";

import { JokeText, Pager, pageParam, param, SourceBadge } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago, fixed, fullName, num, pct } from "@/lib/admin/format";
import { listMatches, listRatings, PAGE_SIZE, type MatchRow } from "@/lib/admin/votes";

export const metadata = { title: "Votes · Humor Admin" };

export default async function VotesPage({ searchParams }: PageProps<"/admin/votes">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = param(sp.tab) === "showdown" ? "showdown" : "ratings";

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Votes</h1>
          <p>
            Star ratings (1–5 per person per post) and Showdown picks (each blind head-to-head is an upvote for one
            joke and a downvote for the other). Read-only — votes belong to the people who cast them.
          </p>
        </div>
        <div className="ad-tabs">
          <Link href="/admin/votes" aria-current={tab === "ratings" ? "page" : undefined}>Star ratings</Link>
          <Link href="/admin/votes?tab=showdown" aria-current={tab === "showdown" ? "page" : undefined}>Showdown votes</Link>
        </div>
      </div>
      {tab === "ratings" ? <Ratings sp={sp} /> : <Showdown sp={sp} />}
    </>
  );
}

type SP = Record<string, string | string[] | undefined>;

async function Ratings({ sp }: { sp: SP }) {
  const starsParam = Number(param(sp.stars, "0"));
  const stars = [1, 2, 3, 4, 5].includes(starsParam) ? starsParam : 0;
  const s = param(sp.source);
  const source = ["human", "ai"].includes(s) ? s : "";
  const page = pageParam(sp.page);
  const { rows, total, summary } = await listRatings({ stars, source, page });
  const maxStar = Math.max(1, ...summary.by_star);

  return (
    <>
      <div className="ad-grid ad-grid--wide-left" style={{ marginBottom: 16 }}>
        <div className="ad-tiles">
          <div className="ad-tile"><div className="ad-tile__label">Ratings</div><div className="ad-tile__value">{num(summary.total)}</div></div>
          <div className="ad-tile"><div className="ad-tile__label">Average</div><div className="ad-tile__value">{fixed(summary.avg)}★</div></div>
          <div className="ad-tile"><div className="ad-tile__label">Raters</div><div className="ad-tile__value">{num(summary.raters)}</div></div>
          <div className="ad-tile"><div className="ad-tile__label">Changed their mind</div><div className="ad-tile__value">{pct(summary.changed, summary.total)}</div><div className="ad-tile__meta">{summary.changed} re-rated</div></div>
        </div>
        <section className="ad-card">
          <div className="ad-card__title" style={{ marginBottom: 10 }}>All ratings by star</div>
          <div className="ad-hbars">
            {summary.by_star.map((n, i) => (
              <Link key={i} href={`/admin/votes?stars=${i + 1}`} className="ad-hbar" style={{ gridTemplateColumns: "28px minmax(0,1fr) auto" }} data-tip={`${i + 1}★: ${n} (${pct(n, summary.total)})`}>
                <span className="ad-hbar__label">{i + 1}★</span>
                <span className="ad-hbar__track"><span className="ad-hbar__seg" style={{ width: `${(n / maxStar) * 100}%`, minWidth: n ? 3 : 0, background: "var(--s-gen)", borderRadius: "0 4px 4px 0" }} /></span>
                <span className="ad-hbar__val">{n}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <form className="ad-toolbar">
        <input type="hidden" name="tab" value="ratings" />
        <select className="ad-select" name="stars" defaultValue={String(stars)} aria-label="Stars">
          <option value="0">Any stars</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
        </select>
        <select className="ad-select" name="source" defaultValue={source} aria-label="Post type">
          <option value="">Any post</option>
          <option value="human">Human jokes</option>
          <option value="ai">AI jokes</option>
        </select>
        <button className="ad-btn">Filter</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead><tr><th>Rater</th><th>Stars</th><th>Post</th><th>Type</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.joke_id}-${r.user_id}`}>
                  <td><Link className="ad-row-link" href={`/admin/users/${r.user_id}`}>{fullName(r.first_name, r.last_name)}</Link></td>
                  <td><span className="ad-stars__on">{"★".repeat(r.rating)}</span><span className="ad-stars__off">{"★".repeat(5 - r.rating)}</span></td>
                  <td className="ad-clip">
                    {r.source === "ai" ? <Link href={`/admin/media/${r.joke_id}`}><JokeText setup={r.setup} /></Link> : <JokeText setup={r.setup} />}
                    <div className="ad-person__sub">#{r.joke_id} · {r.category}</div>
                  </td>
                  <td><SourceBadge source={r.source} /></td>
                  <td className="ad-muted">{ago(r.updated_at)}{r.updated_at !== r.created_at && new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 1000 ? " · edited" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No ratings match.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} path="/admin/votes"
          params={{ ...(stars && { stars: String(stars) }), ...(source && { source }) }} />
      </section>
    </>
  );
}

async function Showdown({ sp }: { sp: SP }) {
  const s = param(sp.status, "voted");
  const status = (["voted", "open", "all"].includes(s) ? s : "voted") as "voted" | "open" | "all";
  const page = pageParam(sp.page);
  const { rows, total, summary } = await listMatches({ status, page });

  return (
    <>
      <div className="ad-tiles" style={{ marginBottom: 16 }}>
        <div className="ad-tile"><div className="ad-tile__label">Votes cast</div><div className="ad-tile__value">{num(summary.voted)}</div><div className="ad-tile__meta">of {num(summary.issued)} pairs shown</div></div>
        <div className="ad-tile"><div className="ad-tile__label">Skipped</div><div className="ad-tile__value">{pct(summary.issued - summary.voted, summary.issued)}</div><div className="ad-tile__meta">shown but never voted on</div></div>
        <div className="ad-tile"><div className="ad-tile__label">Voters</div><div className="ad-tile__value">{num(summary.voters)}</div></div>
        <div className="ad-tile"><div className="ad-tile__label">Left-side bias</div><div className="ad-tile__value">{pct(summary.left_wins, summary.voted)}</div><div className="ad-tile__meta">50% would be fair</div></div>
        <div className="ad-tile"><div className="ad-tile__label">Median decision</div><div className="ad-tile__value">{summary.median_secs != null ? `${Math.round(summary.median_secs)}s` : "—"}</div><div className="ad-tile__meta">from pair shown to vote</div></div>
      </div>

      <div className="ad-toolbar">
        <div className="ad-tabs">
          {(["voted", "open", "all"] as const).map((k) => (
            <Link key={k} href={`/admin/votes?tab=showdown&status=${k}`} aria-current={status === k ? "page" : undefined}>
              {k === "voted" ? "Voted" : k === "open" ? "Unvoted" : "All"}
            </Link>
          ))}
        </div>
      </div>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead><tr><th>Voter</th><th>Upvoted</th><th>Downvoted</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((m) => <MatchLine key={m.id} m={m} />)}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No matches here.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} path="/admin/votes" params={{ tab: "showdown", status }} />
      </section>
    </>
  );
}

function MatchLine({ m }: { m: MatchRow }) {
  const left = { id: m.left_id, setup: m.left_setup, source: m.left_source };
  const right = { id: m.right_id, setup: m.right_setup, source: m.right_source };
  const [up, down] = m.winner_id === m.right_id ? [right, left] : [left, right];
  const cell = (j: typeof left, mark: string) => (
    <td className="ad-clip">
      <span aria-hidden="true" style={{ marginRight: 6 }}>{mark}</span>
      {j.source === "ai" ? <Link href={`/admin/media/${j.id}`}>{j.setup}</Link> : j.setup}{" "}
      <SourceBadge source={j.source} />
    </td>
  );
  return (
    <tr>
      <td><Link className="ad-row-link" href={`/admin/users/${m.voter_id}`}>{fullName(m.first_name, m.last_name)}</Link></td>
      {m.winner_id ? cell(up, "▲") : cell(left, "·")}
      {m.winner_id ? cell(down, "▼") : cell(right, "·")}
      <td className="ad-muted">{m.voted_at ? ago(m.voted_at) : `shown ${ago(m.created_at)}`}</td>
    </tr>
  );
}
