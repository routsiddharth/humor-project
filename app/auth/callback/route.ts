import { NextResponse, type NextRequest } from "next/server";

import { isProfileComplete, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Where Google sends the user back to, via Supabase. Registered in Supabase's
// Redirect URLs allow-list — note that Google itself points at Supabase's
// /auth/v1/callback, not here.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));

  // Behind Vercel's load balancer `origin` is the internal host rather than the
  // deployment the user is actually on. That matters here: the graded URL is a
  // commit-specific deployment, not the production domain, and redirecting to
  // the wrong host drops the session cookie we just set.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  const back = (path: string) => NextResponse.redirect(`${base}${path}`);
  const toLogin = (message: string) =>
    back(`/login?error=${encodeURIComponent(message)}`);

  // Google declines (consent denied, app not published, unregistered URI) come
  // back as query params, not as a thrown error.
  const oauthError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) return toLogin(oauthError);

  const code = searchParams.get("code");
  if (!code) return toLogin("No authorization code was returned by Google.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return toLogin(error?.message ?? "Could not complete sign-in.");
  }

  // By now the on_auth_user_created trigger has inserted the profile row, but
  // with both names NULL. First-time users go to onboarding instead of `next`.
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!isProfileComplete(profile)) {
    return back(`/onboarding?next=${encodeURIComponent(next)}`);
  }

  return back(next);
}
