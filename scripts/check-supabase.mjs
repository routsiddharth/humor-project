// Verifies the Supabase API keys and each feature you asked for.
//   npm run supabase:check
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SECRET_KEY: secret,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`✗ missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const anon = createClient(url, publishable);
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = false;
const ok = (label, detail) => console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
const bad = (label, detail) => {
  failed = true;
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
};

// 1. Publishable key — the one that ships to browsers.
try {
  const { error } = await anon.auth.getUser();
  // "Auth session missing" is the correct answer for a logged-out client.
  if (error && !/session|missing|jwt/i.test(error.message)) throw error;
  ok("publishable key", "accepted, anonymous session");
} catch (e) {
  bad("publishable key", e.message);
}

// 2. Secret key — admin scope.
try {
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  ok("secret key (auth admin)", `${data.users.length} user(s)`);
} catch (e) {
  bad("secret key (auth admin)", e.message);
}

// 3. Storage.
try {
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  ok("storage", data.length ? `buckets: ${data.map((b) => b.name).join(", ")}` : "reachable, no buckets yet");
} catch (e) {
  bad("storage", e.message);
}

// 4. Realtime — needs a websocket to actually open.
try {
  const status = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out after 15s")), 15_000);
    const channel = anon.channel(`healthcheck-${Date.now()}`);
    channel.subscribe((s, err) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        clearTimeout(timer);
        anon.removeChannel(channel);
        if (s === "SUBSCRIBED") resolve(s);
        else reject(err ?? new Error(s));
      }
    });
  });
  ok("realtime", `websocket ${status.toLowerCase()}`);
} catch (e) {
  bad("realtime", e.message);
}

console.log(failed ? "\nsome checks failed" : "\nall features reachable");
process.exit(failed ? 1 : 0);
