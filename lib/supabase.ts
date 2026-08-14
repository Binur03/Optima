import { createBrowserClient } from "@supabase/ssr";

// True once the Supabase Auth keys are present. Middleware and the login page
// gate on this so the app stays usable before auth is configured.
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Browser-side client for the /login page (client components only).
export function browserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
