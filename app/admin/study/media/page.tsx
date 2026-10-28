import Link from "next/link";

import { Pager, pageParam, param } from "@/components/admin/bits";
import { Thumb } from "@/components/admin/study-bits";
import { requireAdmin } from "@/lib/admin/dal";
import { ago } from "@/lib/admin/format";
import { listMedia, MEDIA_PAGE } from "@/lib/admin/study/read";

export const metadata = { title: "AI media · Study · Humor Admin" };

export default async function StudyMediaPage({ searchParams }: PageProps<"/admin/study/media">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const featured = param(sp.featured) === "1";
  const page = pageParam(sp.page);
  const { rows, total } = await listMedia({ q, featured, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>AI media</h1>
          <p>Captions the prompt chains wrote, on the images they were written for. Open one to see every caption on that image. Read-only.</p>
        </div>
      </div>

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Search caption text or chain slug" aria-label="Search media" />
        <label className="ad-check">
          <input type="checkbox" name="featured" value="1" defaultChecked={featured} />
          <span>Featured only</span>
        </label>
        <button className="ad-btn">Apply</button>
      </form>

      {rows.length ? (
        <div className="ad-media-grid">
          {rows.map((m) => (
            <Link key={m.id} href={`/admin/study/media/${m.image_id}`} className="ad-media-card">
              <Thumb url={m.url} size={0} />
              <div className="ad-media-card__body">
                <p className="ad-clamp">{m.content ?? <span className="ad-muted">empty caption</span>}</p>
                <div className="ad-person__sub">
                  {m.flavor_slug ? <span className="ad-mono">{m.flavor_slug}</span> : null}
                  <br />{m.like_count} likes · {ago(m.created_datetime_utc)}{m.is_featured ? " · featured" : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : <section className="ad-card"><p className="ad-empty">No captions match.</p></section>}

      <section className="ad-card ad-card--flush" style={{ marginTop: 16 }}>
        <Pager page={page} pageSize={MEDIA_PAGE} total={total} path="/admin/study/media"
          params={{ ...(q && { q }), ...(featured && { featured: "1" }) }} />
      </section>
    </>
  );
}
