import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/db";

// Identity is the Supabase Auth user. The app's `users.id` is set EQUAL to the
// Supabase `auth.uid()`, so profile + goal + logs are all keyed to it. The row
// is provisioned on first authenticated touch.
//
// STRICT: the only way to authenticate is a valid Supabase Auth session. No dev
// bypass — an unauthenticated request always resolves to null.

async function supabaseUser(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null; // auth not configured yet

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: () => {
        /* read-only here; middleware owns cookie refresh */
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Returns the authenticated app User.id (== auth.uid()), or null. */
export async function getCurrentUserId(req: NextRequest): Promise<string | null> {
  const user = await supabaseUser(req);
  if (user?.id) {
    // Profile row is keyed by auth.uid(). Provision on first touch so downstream
    // FK-bound writes (food logs, daily logs) never hit a missing user.
    const email = (user.email ?? `${user.id}@user.macrodelta`).toLowerCase();
    await prisma.user.upsert({
      where: { id: user.id },
      create: { id: user.id, email },
      update: {},
    });
    return user.id;
  }

  return null;
}
