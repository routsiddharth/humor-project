import { Avatar, Pager, pageParam, param } from "@/components/admin/bits";
import { requireAdmin } from "@/lib/admin/dal";
import { date, fullName, num } from "@/lib/admin/format";
import { listStudyUsers, PAGE, USER_FLAGS, type UserFlag } from "@/lib/admin/study/read";

export const metadata = { title: "Study users · Humor Admin" };

const FLAG_LABELS: Record<UserFlag, string> = { superadmin: "Superadmins", matrix: "Matrix admins", study: "In a study" };

export default async function StudyUsersPage({ searchParams }: PageProps<"/admin/study/users">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().slice(0, 100);
  const flagParam = param(sp.flag);
  const flag = flagParam in USER_FLAGS ? (flagParam as UserFlag) : null;
  const page = pageParam(sp.page);
  const { rows, total } = await listStudyUsers({ q, flag, page });

  return (
    <>
      <div className="ad-page-head">
        <div>
          <h1>Users</h1>
          <p>Every profile in the study database. Read-only. Names and contacts in the teaching snapshot are fictional.</p>
        </div>
      </div>

      <form className="ad-toolbar" role="search">
        <input className="ad-input ad-grow" type="search" name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" />
        <select className="ad-select" name="flag" defaultValue={flag ?? ""} aria-label="Filter">
          <option value="">Everyone</option>
          {Object.entries(FLAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="ad-btn">Apply</button>
      </form>

      <section className="ad-card ad-card--flush">
        <div className="ad-table-wrap">
          <table>
            <thead>
              <tr><th>Person</th><th>Roles</th><th>Joined</th><th className="ad-r">Captions</th><th className="ad-r">Votes cast</th></tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="ad-person">
                      <Avatar first={u.first_name} last={u.last_name} />
                      <span className="ad-person__text">
                        <span>{u.first_name || u.last_name ? fullName(u.first_name, u.last_name) : <span className="ad-muted">No name</span>}</span>
                        <span className="ad-person__sub" style={{ display: "block" }}>{u.email ?? "—"}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="ad-badges">
                      {u.is_superadmin ? <span className="ad-badge ad-badge--accent">superadmin</span> : null}
                      {u.is_matrix_admin ? <span className="ad-badge">matrix admin</span> : null}
                      {u.is_in_study ? <span className="ad-badge">in study</span> : null}
                    </span>
                  </td>
                  <td>{date(u.created_datetime_utc)}</td>
                  <td className="ad-r">{num(u.captions)}</td>
                  <td className="ad-r">{num(u.votes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="ad-empty">No users match.</p> : null}
        </div>
        <Pager page={page} pageSize={PAGE} total={total} path="/admin/study/users" params={{ ...(q && { q }), ...(flag && { flag }) }} />
      </section>
    </>
  );
}
