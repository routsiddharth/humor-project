// Server-rendered charts. Marks are plain HTML sized with CSS, so they stay
// crisp at any width and need no client JavaScript; hover detail comes from the
// shared <Tooltips /> via `data-tip`. Every chart ships a table view, because
// two of the light-mode series colors sit below 3:1 against the surface.

import type { CategoryRow, Critic, DayRow, Funnel, HeatCell, StarRow } from "@/lib/admin/stats";
import { fixed, fullName, niceMax, num, pct } from "@/lib/admin/format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shortDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------- daily activity: single-series columns ----------

export function ActivityColumns({ days }: { days: DayRow[] }) {
  const totals = days.map((d) => d.posts + d.ratings + d.votes + d.generations);
  const max = niceMax(Math.max(...totals, 1));
  const ticks = [0, max / 2, max];

  return (
    <div className="ad-chart">
      <div className="ad-cols">
        <div className="ad-cols__grid" aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className="ad-cols__line" style={{ top: `${100 - (t / max) * 100}%` }}>
              <span className="ad-cols__tick">{num(t)}</span>
            </div>
          ))}
        </div>
        <div className="ad-cols__bars">
          {days.map((d, i) => (
            <div
              key={d.day}
              className="ad-cols__col"
              data-tip={`${shortDay(d.day)} — ${totals[i]} actions\n${d.posts} posts · ${d.ratings} ratings\n${d.votes} showdown votes · ${d.generations} generations`}
            >
              <div className="ad-cols__stack" style={{ height: `${(totals[i] / max) * 100}%` }}>
                <div className="ad-cols__seg" style={{ flex: 1, background: "var(--seq-4)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ad-cols__axis" aria-hidden="true">
        <span>{shortDay(days[0].day)}</span>
        <span>{shortDay(days[Math.floor(days.length / 2)].day)}</span>
        <span>Today</span>
      </div>
      <details className="ad-table-view">
        <summary>View as table</summary>
        <div className="ad-table-wrap">
          <table>
            <thead><tr><th>Day</th><th className="ad-r">Posts</th><th className="ad-r">Ratings</th><th className="ad-r">Votes</th><th className="ad-r">Generations</th></tr></thead>
            <tbody>
              {days.filter((_, i) => totals[i] > 0).reverse().map((d) => (
                <tr key={d.day}><td>{shortDay(d.day)}</td><td className="ad-r">{d.posts}</td><td className="ad-r">{d.ratings}</td><td className="ad-r">{d.votes}</td><td className="ad-r">{d.generations}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ---------- when people show up: day × hour heatmap ----------

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const c of cells) grid[c.dow - 1][c.hr] = c.n;
  const max = Math.max(1, ...grid.flat());
  const level = (n: number) => (n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 7)));
  const hour = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

  let peak = { dow: 0, hr: 0, n: 0 };
  grid.forEach((row, d) => row.forEach((n, h) => { if (n > peak.n) peak = { dow: d, hr: h, n }; }));

  return (
    <div className="ad-chart">
      <div className="ad-heat" role="img" aria-label={`Activity by weekday and hour. Busiest: ${DAYS[peak.dow]} ${hour(peak.hr)} with ${peak.n} actions.`}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="ad-heat__hr">{h % 6 === 0 ? hour(h) : ""}</span>
        ))}
        {grid.map((row, d) => (
          <Row key={d} label={DAYS[d]}>
            {row.map((n, h) => (
              <span
                key={h}
                className="ad-heat__cell"
                style={{ background: `var(--seq-${level(n)})` }}
                data-tip={`${DAYS[d]} ${hour(h)}–${hour((h + 1) % 24)}\n${n} action${n === 1 ? "" : "s"}`}
              />
            ))}
          </Row>
        ))}
      </div>
      <div className="ad-toolbar" style={{ marginTop: 12, marginBottom: 0, justifyContent: "space-between" }}>
        <span className="ad-muted" style={{ fontSize: 12.5 }}>
          Peak: <strong style={{ color: "var(--text)" }}>{DAYS[peak.dow]} around {hour(peak.hr)}</strong> (Eastern)
        </span>
        <span className="ad-ramp">
          0
          <span className="ad-ramp__steps" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((l) => <span key={l} style={{ background: `var(--seq-${l})` }} />)}
          </span>
          {num(max)}
        </span>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="ad-heat__row">{label}</span>
      {children}
    </>
  );
}

// ---------- star distributions: small multiples ----------

const GROUPS = [
  { key: "human", label: "Human jokes", color: "var(--s-human)" },
  { key: "ai", label: "AI jokes", color: "var(--s-ai)" },
] as const;

export function StarHistograms({ rows }: { rows: StarRow[] }) {
  const data = GROUPS.map((g) => {
    const counts = [1, 2, 3, 4, 5].map((s) => rows.find((r) => r.grp === g.key && r.stars === s)?.n ?? 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const avg = total ? counts.reduce((a, n, i) => a + n * (i + 1), 0) / total : null;
    return { ...g, counts, total, avg };
  });
  // One shared scale across panels, so heights compare across them.
  const maxShare = Math.max(0.01, ...data.flatMap((d) => d.counts.map((n) => (d.total ? n / d.total : 0))));

  return (
    <div className="ad-chart">
      <div className="ad-hists">
        {data.map((d) => (
          <div key={d.key}>
            <div className="ad-hist__title">
              <span className="ad-key__sw" style={{ background: d.color }} />
              <span>{d.label}</span>
              <span>{d.avg ? `${d.avg.toFixed(2)}★ avg` : "no votes"}</span>
            </div>
            <div className="ad-hist__plot">
              {d.counts.map((n, i) => {
                const share = d.total ? n / d.total : 0;
                return (
                  <div key={i} className="ad-hist__bar" data-tip={`${d.label}: ${i + 1}★\n${n} of ${d.total} ratings (${pct(n, d.total)})`}>
                    {share > 0 ? <span className="ad-hist__val">{pct(n, d.total)}</span> : null}
                    <div className="ad-hist__fill" style={{ height: `${(share / maxShare) * 82}%`, background: d.color }} />
                  </div>
                );
              })}
            </div>
            <div className="ad-hist__axis" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((s) => <span key={s}>{s}★</span>)}
            </div>
          </div>
        ))}
      </div>
      <details className="ad-table-view">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Group</th>{[1, 2, 3, 4, 5].map((s) => <th key={s} className="ad-r">{s}★</th>)}<th className="ad-r">Total</th><th className="ad-r">Avg</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}><td>{d.label}</td>{d.counts.map((n, i) => <td key={i} className="ad-r">{n}</td>)}<td className="ad-r">{d.total}</td><td className="ad-r">{fixed(d.avg)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ---------- the AI pipeline: an ordinal funnel ----------

export function FunnelBars({ funnel }: { funnel: Funnel }) {
  const steps = [
    { label: "Generated", n: funnel.generated, hint: "Calls to Gemini (every row in generations)" },
    { label: "Posted", n: funnel.posted, hint: "Became an AI joke on the board" },
    { label: "Rated", n: funnel.rated, hint: "Got at least one star rating" },
    { label: "Won a match", n: funnel.won, hint: "Beat something in Showdown" },
  ];
  const max = Math.max(1, steps[0].n, steps[1].n);
  return (
    <div className="ad-hbars">
      {steps.map((s, i) => (
        <div key={s.label} className="ad-hbar" data-tip={`${s.label}: ${s.n}\n${s.hint}${i ? `\n${pct(s.n, steps[i - 1].n)} of the step before` : ""}`}>
          <span className="ad-hbar__label">{s.label}</span>
          <span className="ad-hbar__track">
            <span className="ad-hbar__seg" style={{ width: `${(s.n / max) * 100}%`, minWidth: s.n ? 3 : 0, background: `var(--seq-${3 + i})`, borderRadius: "0 4px 4px 0" }} />
          </span>
          <span className="ad-hbar__val">
            {num(s.n)}
            {i ? <small>{pct(s.n, steps[i - 1].n)}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- categories: stacked horizontal bars ----------

export function CategoryBars({ rows }: { rows: CategoryRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.human + r.ai));
  const parts = [
    { key: "human", label: "Human", color: "var(--s-human)" },
    { key: "ai", label: "AI", color: "var(--s-ai)" },
  ] as const;
  return (
    <div className="ad-chart">
      <div className="ad-legend" style={{ marginBottom: 12 }}>
        {parts.map((p) => <span key={p.key} className="ad-key"><span className="ad-key__sw" style={{ background: p.color }} />{p.label}</span>)}
      </div>
      <div className="ad-hbars">
        {rows.map((r) => {
          const total = r.human + r.ai;
          const segs = parts.filter((p) => r[p.key] > 0);
          return (
            <div key={r.category} className="ad-hbar" data-tip={`${r.category}: ${total} jokes\n${r.human} human · ${r.ai} AI\nAvg ${r.avg_stars ? r.avg_stars.toFixed(2) + "★" : "unrated"}`}>
              <span className="ad-hbar__label" title={r.category}>{r.category}</span>
              <span className="ad-hbar__track" style={{ width: `${(total / max) * 100}%` }}>
                {segs.map((p) => (
                  <span key={p.key} className="ad-hbar__seg" style={{ flex: r[p.key], background: p.color }} />
                ))}
              </span>
              <span className="ad-hbar__val">{total}<small>{r.avg_stars ? `${r.avg_stars.toFixed(1)}★` : "—"}</small></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- the critic spectrum: one dot per rater ----------

export function CriticStrip({ critics, siteAvg }: { critics: Critic[]; siteAvg: number | null }) {
  if (!critics.length) return <p className="ad-empty">Nobody has rated two or more posts yet.</p>;
  const x = (avg: number) => `${((avg - 1) / 4) * 100}%`;

  // Nudge dots that would land on top of each other into alternate lanes.
  const placed: { c: Critic; lane: number }[] = [];
  for (const c of critics) {
    const near = placed.filter((p) => Math.abs(p.c.avg - c.avg) < 0.12).length;
    placed.push({ c, lane: near });
  }
  const laneY = (lane: number) => 36 + (lane === 0 ? 0 : (lane % 2 ? -1 : 1) * Math.ceil(lane / 2) * 13);

  const harsh = critics[0];
  const kind = critics[critics.length - 1];

  return (
    <div className="ad-chart">
      <div className="ad-strip">
        <div className="ad-strip__axis" />
        {[1, 2, 3, 4, 5].map((s) => <span key={s} className="ad-strip__tick" style={{ left: x(s) }}>{s}★</span>)}
        {siteAvg ? (
          <div className="ad-strip__mean" style={{ left: x(siteAvg) }}><span>avg {siteAvg.toFixed(2)}</span></div>
        ) : null}
        {placed.map(({ c, lane }) => (
          <span
            key={c.id}
            className="ad-strip__dot"
            style={{ left: x(c.avg), top: laneY(lane) }}
            data-tip={`${fullName(c.first_name, c.last_name)}\nGives ${c.avg.toFixed(2)}★ on average over ${c.n} ratings`}
          />
        ))}
      </div>
      <div className="ad-strip__ends">
        <div>
          <div className="ad-muted" style={{ fontSize: 12 }}>Harshest critic</div>
          <div><strong>{fullName(harsh.first_name, harsh.last_name)}</strong> <span className="ad-muted ad-num">{harsh.avg.toFixed(2)}★ · {harsh.n}</span></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="ad-muted" style={{ fontSize: 12 }}>Easiest crowd</div>
          <div><strong>{fullName(kind.first_name, kind.last_name)}</strong> <span className="ad-muted ad-num">{kind.avg.toFixed(2)}★ · {kind.n}</span></div>
        </div>
      </div>
    </div>
  );
}
