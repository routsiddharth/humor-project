// Deliberately dependency-free. proxy.ts runs in the Edge runtime and cannot
// import lib/auth.ts, which is `server-only` and reaches for next/headers.

// Where a signed-in user belongs. `/` is the signed-out landing page.
export const HOME = "/jokes";

// Signed-in-only routes, shared by the proxy's optimistic check and the
// per-page gates. `/` is absent on purpose: it is the public landing page.
export const PROTECTED_PREFIXES = ["/jokes", "/profile", "/submit", "/onboarding"];

export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
