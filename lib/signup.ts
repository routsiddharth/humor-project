import "server-only";

import { query } from "@/lib/db";

// Who may sign in, from allowed_signup_domains and whitelisted_emails (0013).
// With no domain listed the board is open, as it always was. Once one is, an
// account gets in if its domain is listed (or is a subdomain of one), if its
// address is whitelisted, or if it is a superadmin — the last so the admin
// panel can never be used to lock its own admin out.
export async function maySignIn(userId: string, email: string | undefined): Promise<boolean> {
  const address = (email ?? "").toLowerCase();
  const { rows } = await query<{ gated: boolean; ok: boolean }>(
    `select exists (select 1 from public.allowed_signup_domains) as gated,
            coalesce((select is_superadmin from public.profiles where id = $1), false)
            or exists (select 1 from public.whitelisted_emails where email = $2)
            or exists (select 1 from public.allowed_signup_domains d
                        where split_part($2, '@', 2) = d.domain
                           or split_part($2, '@', 2) like '%.' || d.domain) as ok`,
    [userId, address],
  );
  return !rows[0]?.gated || rows[0].ok;
}
