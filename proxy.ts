import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { HOME, isProtected } from "@/lib/routes";

// NOTE: Next.js 16 deprecated `middleware.ts` and renamed the convention to
// `proxy.ts` with a `proxy` export. Supabase's published guides still show the
// old name; that file would simply never run here.
//
// Auth tokens expire. Server Components cannot write cookies, so without this
// refresh a user gets logged out mid-session.

// The route list lives in lib/routes.ts so the pages and this file cannot drift
// apart. This is the optimistic check the Next.js docs recommend for Proxy —
// fast and cookie-based. The pages themselves still call requireUser() /
// requireCompleteProfile(), which is the authoritative gate, and since 0004 the
// jokes/ratings select policies are `to authenticated`, so the database refuses
// anonymous reads even if both were somehow bypassed.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be getUser(), not getSession(): only getUser() revalidates the token
  // with Supabase. getSession() trusts the cookie, which is spoofable.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return redirectKeepingCookies(url, response);
  }

  // Nothing to log in to when already signed in.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = HOME;
    url.search = "";
    return redirectKeepingCookies(url, response);
  }

  return response;
}

// A bare NextResponse.redirect() would throw away the refreshed session cookies
// that createServerClient just wrote onto `response`, logging the user out on
// exactly the request that bounced them.
function redirectKeepingCookies(url: URL, carrying: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of carrying.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
