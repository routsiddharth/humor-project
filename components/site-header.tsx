import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { getProfile, getUser } from "@/lib/auth";
import { avatarUrl, displayName, initials } from "@/lib/avatar";

// Async Server Component rather than logic in the root layout, so the layout
// itself stays a plain function and the cookie read is scoped to the header.
export async function SiteHeader() {
  const user = await getUser();
  const profile = user ? await getProfile(user.id) : null;
  const name = displayName(profile?.first_name, profile?.last_name);
  const photo = avatarUrl(profile?.avatar_path);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          humor-project
        </Link>

        <nav className="site-header__nav">
          {user ? (
            <>
              <Link href="/submit" className="nav-link">
                Post a joke
              </Link>
              <Link href="/profile" className="nav-link nav-link--me">
                <span className="avatar" aria-hidden="true">
                  {photo ? <img src={photo} alt="" /> : initials(profile?.first_name, profile?.last_name)}
                </span>
                <span className="nav-link__name">{name ?? "Profile"}</span>
              </Link>
              <form action={signOut}>
                <button type="submit" className="btn btn--ghost">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn btn--primary btn--sm">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
