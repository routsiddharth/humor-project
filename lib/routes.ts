// Deliberately dependency-free. proxy.ts runs in the Edge runtime and cannot
// import lib/auth.ts, which is `server-only` and reaches for next/headers.

// The front page of the site, signed in or not. `/` just redirects here.
export const HOME = "/jokes";

// Signed-in-only routes, shared by the proxy's optimistic check and the
// per-page gates. Reading is public — /jokes, /people and the leaderboard are
// absent on purpose — so this is the list of pages that exist to write.
export const PROTECTED_PREFIXES = [
  "/profile",
  "/submit",
  "/generate",
  "/showdown",
  "/onboarding",
];

// Carve-outs under a protected prefix. The leaderboard only reads aggregates;
// it is voting in /showdown itself that needs a session.
export const PUBLIC_PATHS = ["/showdown/leaderboard"];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtected(pathname: string): boolean {
  if (PUBLIC_PATHS.some((path) => matches(pathname, path))) return false;
  return PROTECTED_PREFIXES.some((prefix) => matches(pathname, prefix));
}
