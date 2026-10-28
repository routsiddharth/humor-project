import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin/dal";
import { ago, dateTime, num } from "@/lib/admin/format";
import { UUID_RE } from "@/lib/admin/study/fields";
import { getImage } from "@/lib/admin/study/read";

export const metadata = { title: "Image · Study · Humor Admin" };

export default async function StudyImagePage({ params }: PageProps<"/admin/study/media/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await getImage(id);
  if (!data) notFound();
  const { image: i, captions, requests } = data;

  return (
    <>
      <div className="ad-crumbs"><Link href="/admin/study/media">AI media</Link> / image</div>
      <div className="ad-page-head">
        <div>
          <h1>Image</h1>
          <p className="ad-mono">{i.id}</p>
        </div>
      </div>

      <div className="ad-grid ad-grid--wide-left">
        <div className="ad-stack">
          <section className="ad-card ad-card--flush">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {i.url ? <img src={i.url} alt={i.image_description ?? ""} className="ad-hero-img" /> : <p className="ad-empty">No image URL.</p>}
          </section>
          <section className="ad-card ad-card--flush">
            <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Captions ({captions.length})</div></div>
            {captions.length ? (
              <div className="ad-table-wrap">
                <table>
                  <thead><tr><th>Caption</th><th>Chain</th><th className="ad-r">Likes</th><th className="ad-r">Votes</th><th>Request</th><th>Written</th></tr></thead>
                  <tbody>
                    {captions.map((c) => (
                      <tr key={c.id}>
                        <td className="ad-clip">{c.content ?? <span className="ad-muted">empty</span>}{c.is_featured ? <> <span className="ad-badge ad-badge--accent">featured</span></> : null}</td>
                        <td className="ad-clip">{c.humor_flavor_id ? <Link href={`/admin/study/chains/${c.humor_flavor_id}`} className="ad-mono">{c.flavor_slug}</Link> : <span className="ad-muted">human</span>}</td>
                        <td className="ad-r">{num(c.like_count)}</td>
                        <td className="ad-r">{num(c.votes)}</td>
                        <td>{c.caption_request_id ? <Link href={`/admin/study/requests/${c.caption_request_id}`}>#{c.caption_request_id}</Link> : "—"}</td>
                        <td className="ad-muted">{ago(c.created_datetime_utc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="ad-empty">No captions on this image.</p>}
          </section>
        </div>

        <div className="ad-stack">
          <section className="ad-card">
            <dl className="ad-facts">
              <dt>Uploaded</dt><dd>{dateTime(i.created_datetime_utc)}</dd>
              <dt>Owner</dt><dd>{i.owner ?? "—"}</dd>
              <dt>Public</dt><dd>{i.is_public ? "yes" : "no"}</dd>
              <dt>Common use</dt><dd>{i.is_common_use ? "yes" : "no"}</dd>
              <dt>Context</dt><dd>{i.additional_context ?? <span className="ad-muted">—</span>}</dd>
              <dt>Celebrities</dt><dd>{i.celebrity_recognition ?? <span className="ad-muted">—</span>}</dd>
            </dl>
          </section>
          {i.image_description ? (
            <section className="ad-card">
              <div className="ad-card__head"><div className="ad-card__title">AI description</div></div>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>{i.image_description}</p>
            </section>
          ) : null}
          <section className="ad-card ad-card--flush">
            <div className="ad-card__head" style={{ padding: "16px 16px 0" }}><div className="ad-card__title">Generation requests ({requests.length})</div></div>
            {requests.length ? (
              <table>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/admin/study/requests/${r.id}`} className="ad-row-link">#{r.id}</Link></td>
                      <td>{r.requester ?? "—"}</td>
                      <td className="ad-muted">{ago(r.created_datetime_utc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="ad-empty">Never sent for generation.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
