import Link from "next/link";

import { JokeText, SourceBadge } from "@/components/admin/bits";
import { ActivityColumns, CategoryBars, CriticStrip, FunnelBars, Heatmap, StarHistograms } from "@/components/admin/charts";
import { requireAdmin } from "@/lib/admin/dal";
import { fixed, num, pct } from "@/lib/admin/format";
import { getOverview, type Ranked } from "@/lib/admin/stats";

export const metadata = { title: "Overview · Humor Admin" };

export default async function OverviewPage() {
  await requireAdmin();
  const o = await getOverview();
  const { totals: t, h2h } = o;

  const human = o.sources.find((s) => s.source === "human");
  const ai = o.sources.find((s) => s.source === "ai");
  const aiRate = h2h.matches ? h2h.ai_wins / h2h.matches : null;
  const humanWins = h2h.matches - h2h.ai_wins;

  const allStars = o.stars.reduce((a, r) => a + r.n, 0);
  const siteAvg = allStars ? o.stars.reduce((a, r) => a + r.n * r.stars, 0) / allStars : null;

  const postDelta = t.posts_7d - t.posts_prev_7d;

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Overview</h1>
          <p>Live from the humor-project database. Hover any mark for detail.</p>
        </div>
      </div>

      {/* ---------- the headline: can AI out-joke people? ---------- */}
      <section className="ad-card ad-hero" aria-labelledby="turing">
        <div>
          <div className="ad-hero__kicker" id="turing">The Turing scoreboard</div>
          <div className="ad-hero__figure">{aiRate == null ? "—" : pct(h2h.ai_wins, h2h.matches)}</div>
          <p className="ad-hero__copy">
            {aiRate == null ? (
              <>No blind Showdown match has put an AI joke against a human one yet.</>
            ) : (
              <>
                When a blind Showdown voter sees an <strong>AI joke beside a human one</strong>, they pick the AI
                {" "}{pct(h2h.ai_wins, h2h.matches)} of the time — across <strong>{num(h2h.matches)} cross-matches</strong>.
                {" "}{aiRate > 0.5 ? "The machines are ahead." : aiRate < 0.5 ? "People are still funnier." : "Dead even."}
              </>
            )}
          </p>
          {h2h.matches ? (
            <>
              <div className="ad-split" role="img" aria-label={`AI ${h2h.ai_wins} wins, human ${humanWins} wins`}>
                {h2h.ai_wins ? <span className="ad-split__seg ad-bg-ai" style={{ flex: h2h.ai_wins }} data-tip={`AI won ${h2h.ai_wins}`} /> : null}
                {humanWins ? <span className="ad-split__seg ad-bg-human" style={{ flex: humanWins }} data-tip={`Human won ${humanWins}`} /> : null}
              </div>
              <div className="ad-split__legend">
                <span className="ad-key"><span className="ad-key__sw ad-bg-ai" />AI {num(h2h.ai_wins)}</span>
                <span className="ad-key">Human {num(humanWins)}<span className="ad-key__sw ad-bg-human" /></span>
              </div>
            </>
          ) : null}
        </div>

        <div className="ad-versus" role="table" aria-label="Human versus AI">
          <div className="ad-versus__h" role="columnheader" />
          <div className="ad-versus__h ad-versus__v" role="columnheader"><span className="ad-key"><span className="ad-key__sw ad-bg-human" />Human</span></div>
          <div className="ad-versus__h ad-versus__v" role="columnheader"><span className="ad-key"><span className="ad-key__sw ad-bg-ai" />AI</span></div>
          <Versus label="Written jokes" a={t.human_jokes} b={t.ai_jokes} fmt={num} />
          <Versus label="Avg stars" a={human?.avg_stars} b={ai?.avg_stars} fmt={(v) => fixed(v)} subA={human?.star_votes} subB={ai?.star_votes} />
          <Versus label="Avg Showdown Elo" a={human?.avg_elo} b={ai?.avg_elo} fmt={(v) => fixed(v, 0)} subA={human?.ranked} subB={ai?.ranked} />
        </div>
      </section>

      {/* ---------- totals ---------- */}
      <div className="ad-tiles" style={{ marginTop: 16 }}>
        <Tile label="Users" value={num(t.users)} meta={`${num(t.onboarded)} onboarded · ${t.admins} admin`} />
        <Tile label="Active, last 7 days" value={num(t.active_7d)} meta={`${pct(t.active_7d, t.users)} of everyone`} />
        <Tile
          label="Posts, last 7 days"
          value={num(t.posts_7d)}
          meta={<span className={postDelta > 0 ? "ad-delta--up" : postDelta < 0 ? "ad-delta--down" : ""}>{postDelta >= 0 ? "+" : ""}{postDelta} vs prior week</span>}
        />
        <Tile label="All jokes" value={num(t.human_jokes + t.ai_jokes)} meta={`${num(t.human_jokes)} human · ${num(t.ai_jokes)} AI`} />
        <Tile label="Star ratings" value={num(t.ratings)} meta={siteAvg ? `${siteAvg.toFixed(2)}★ site average` : "none yet"} />
        <Tile label="Showdown votes" value={num(t.votes)} meta="blind head-to-heads" />
        <Tile label="Gemini calls" value={num(t.generations)} meta={`${pct(o.funnel.posted, o.funnel.generated)} got posted`} />
      </div>

      {/* ---------- rhythm ---------- */}
      <h2 className="ad-section-title">Rhythm</h2>
      <div className="ad-grid ad-grid--2">
        <section className="ad-card">
          <div className="ad-card__head">
            <div>
              <div className="ad-card__title">Actions per day</div>
              <div className="ad-card__sub">Posts, ratings, Showdown votes and generations · last 60 days</div>
            </div>
          </div>
          <ActivityColumns days={o.days} />
        </section>
        <section className="ad-card">
          <div className="ad-card__head">
            <div>
              <div className="ad-card__title">When people show up</div>
              <div className="ad-card__sub">Every action ever, by weekday and hour (Eastern)</div>
            </div>
          </div>
          <Heatmap cells={o.heat} />
        </section>
      </div>

      {/* ---------- taste ---------- */}
      <h2 className="ad-section-title">Taste</h2>
      <section className="ad-card">
        <div className="ad-card__head">
          <div>
            <div className="ad-card__title">How human and AI jokes get rated</div>
            <div className="ad-card__sub">Share of star ratings at each level — same scale on both</div>
          </div>
        </div>
        <StarHistograms rows={o.stars} />
      </section>

      <div className="ad-grid ad-grid--2" style={{ marginTop: 16 }}>
        <section className="ad-card">
          <div className="ad-card__head">
            <div>
              <div className="ad-card__title">The critic spectrum</div>
              <div className="ad-card__sub">Each dot is a person, placed at the average star rating they give</div>
            </div>
          </div>
          <CriticStrip critics={o.critics} siteAvg={siteAvg} />
        </section>
        <section className="ad-card">
          <div className="ad-card__head">
            <div>
              <div className="ad-card__title">Most divisive jokes</div>
              <div className="ad-card__sub">Widest spread of star ratings — people love it or hate it</div>
            </div>
          </div>
          {o.divisive.length ? o.divisive.map((d, i) => (
            <div key={d.id} className="ad-rank">
              <span className="ad-rank__n">{i + 1}</span>
              <div>
                <JokeText setup={d.setup} punchline={d.punchline} />
                <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <SourceBadge source={d.source} />
                  <span className="ad-muted" style={{ fontSize: 12 }}>{d.category}</span>
                </div>
              </div>
              <div className="ad-rank__score">
                <div className="ad-mini-dist" aria-label={`Ratings 1 to 5 stars: ${d.dist.join(", ")}`}>
                  {d.dist.map((n, s) => (
                    <span key={s} style={{ height: `${(n / Math.max(...d.dist)) * 100}%` }} data-tip={`${s + 1}★ × ${n}`} />
                  ))}
                </div>
                <small>±{d.sd.toFixed(2)} · {d.n} votes</small>
              </div>
            </div>
          )) : <p className="ad-empty">Needs posts with at least two ratings.</p>}
        </section>
      </div>

      {/* ---------- showdown ---------- */}
      <h2 className="ad-section-title">Showdown ladder</h2>
      <div className="ad-grid ad-grid--2">
        <section className="ad-card">
          <div className="ad-card__head"><div className="ad-card__title">Top of the Elo ladder</div></div>
          <Ladder rows={o.top} />
        </section>
        <section className="ad-card">
          <div className="ad-card__head"><div className="ad-card__title">Bottom of the ladder</div></div>
          <Ladder rows={o.bottom} startAt={null} />
        </section>
      </div>

      {/* ---------- AI ---------- */}
      <h2 className="ad-section-title">AI pipeline</h2>
      <div className="ad-grid ad-grid--3">
        <section className="ad-card ad-span-2">
          <div className="ad-card__head">
            <div>
              <div className="ad-card__title">From prompt to punchline</div>
              <div className="ad-card__sub">How many Gemini drafts survive each step</div>
            </div>
            <Link href="/admin/media/generations" className="ad-btn ad-btn--sm">Ledger</Link>
          </div>
          <FunnelBars funnel={o.funnel} />
        </section>
        <section className="ad-card">
          <div className="ad-card__head"><div className="ad-card__title">What people ask for</div></div>
          {o.topics.length ? (
            <ol className="ad-hbars" style={{ listStyle: "none" }}>
              {o.topics.map((tp) => (
                <li key={tp.topic} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{tp.topic}”</span>
                  <span className="ad-muted ad-num">{tp.n}</span>
                </li>
              ))}
            </ol>
          ) : <p className="ad-muted">Everyone pressed Generate without a topic.</p>}
          <div className="ad-muted" style={{ fontSize: 12, marginTop: 14 }}>
            Models: {o.models.map((m) => `${m.model} (${m.n})`).join(", ") || "none yet"}
          </div>
        </section>
      </div>

      <h2 className="ad-section-title">Categories</h2>
      <section className="ad-card">
        <div className="ad-card__head">
          <div>
            <div className="ad-card__title">Posts by category</div>
            <div className="ad-card__sub">Top 10 by volume, with each category&rsquo;s average star rating</div>
          </div>
        </div>
        <CategoryBars rows={o.categories} />
      </section>
    </>
  );
}

function Tile({ label, value, meta }: { label: string; value: string; meta?: React.ReactNode }) {
  return (
    <div className="ad-tile">
      <div className="ad-tile__label">{label}</div>
      <div className="ad-tile__value">{value}</div>
      {meta ? <div className="ad-tile__meta">{meta}</div> : null}
    </div>
  );
}

function Versus({ label, a, b, fmt, subA, subB }:
  { label: string; a: number | null | undefined; b: number | null | undefined; fmt: (v: number) => string; subA?: number; subB?: number }) {
  const winA = a != null && b != null && a > b;
  const winB = a != null && b != null && b > a;
  return (
    <>
      <div role="rowheader" className="ad-muted">{label}</div>
      <div role="cell" className={`ad-versus__v${winA ? " ad-versus__win" : ""}`}>
        {a == null ? "—" : fmt(a)}{subA != null ? <small>n={subA}</small> : null}
      </div>
      <div role="cell" className={`ad-versus__v${winB ? " ad-versus__win" : ""}`}>
        {b == null ? "—" : fmt(b)}{subB != null ? <small>n={subB}</small> : null}
      </div>
    </>
  );
}

function Ladder({ rows, startAt = 1 }: { rows: Ranked[]; startAt?: number | null }) {
  if (!rows.length) return <p className="ad-empty">No completed Showdown matches yet.</p>;
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.id} className="ad-rank">
          <span className="ad-rank__n">{startAt ? startAt + i : "·"}</span>
          <div>
            <JokeText setup={r.setup} punchline={r.punchline} />
            <div style={{ marginTop: 6 }}><SourceBadge source={r.source} /></div>
          </div>
          <div className="ad-rank__score">
            {Math.round(r.rating)}
            <small>{r.wins}–{r.losses}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
