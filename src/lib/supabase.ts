import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and a Supabase key are required.");
}

// Server-only client (route handlers). Prefers SUPABASE_SERVICE_ROLE_KEY if set,
// otherwise falls back to the publishable/anon key — see supabase/schema.sql for the
// RLS policies that make the anon-key fallback work pre-auth.
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
