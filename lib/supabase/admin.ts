import "server-only";

import { createClient } from "@supabase/supabase-js";

// Admin client. BYPASSES ROW LEVEL SECURITY — every row is readable and
// writable regardless of policy. Use only where that is the intent: webhooks,
// background jobs, seeding. Never reach for it to "fix" an RLS error.
//
// The `server-only` import above turns an accidental Client Component import
// into a build error rather than a leaked key.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
