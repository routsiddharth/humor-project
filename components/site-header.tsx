import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { getProfile, getUser } from "@/lib/auth";
import { avatarUrl, displayName, initials } from "@/lib/avatar";
import { ThemeToggle } from "@/components/theme-toggle";

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
          {/* Shown signed out too: browsing is public, and the gated ones send
              a visitor to sign in and then straight back. The two things the
              site is for come first and louder; making posts sits behind a
              divider as the secondary pair. */}
          <Link href="/jokes" className="nav-link nav-link--main">
            Rate
          </Link>
          <Link href="/showdown" className="nav-link nav-link--main">
            Showdown
          </Link>
          <span className="site-header__divider" aria-hidden="true" />
          <Link href="/submit" className="nav-link">
            Post
          </Link>
          <Link href="/generate" className="nav-link nav-link--extra">
            Generate
          </Link>
          <ThemeToggle />
          {profile?.is_superadmin ? (
            // Only rendered for superadmins. Hiding the tab is a courtesy, not
            // the lock: /admin checks the flag itself on every request.
            <Link href="/admin" className="nav-link">
              Admin
            </Link>
          ) : null}
          {user ? (
            <>
              <Link href={`/people/${user.id}`} className="nav-link nav-link--me">
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
