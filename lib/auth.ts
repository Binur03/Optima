import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { Prisma } from "@prisma/client";
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

/** Returns the authenticated app User.id, or null. */
export async function getCurrentUserId(req: NextRequest): Promise<string | null> {
  const user = await supabaseUser(req);
  if (!user?.id) return null;
  const email = (user.email ?? `${user.id}@user.optima`).toLowerCase();
  return ensureProfile(user.id, email);
}

// Resolves the app user row for an authenticated identity, provisioning it once.
// New users are keyed to auth.uid(); but we RECONCILE first — reusing any row
// that already matches by id OR by email — so a legacy/pre-auth row with the
// same email (or a concurrent first-load request) can't cause a P2002 collision.
async function ensureProfile(authId: string, email: string): Promise<string> {
  const byId = await prisma.user.findUnique({ where: { id: authId }, select: { id: true } });
  if (byId) return byId.id;

  // Existing row for this email (legacy pre-auth row, or a concurrent create).
  const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (byEmail) return byEmail.id;

  try {
    const created = await prisma.user.create({ data: { id: authId, email }, select: { id: true } });
    return created.id;
  } catch (e) {
    // Lost a concurrent-create race → the row now exists by id or email.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const row = await prisma.user.findFirst({
        where: { OR: [{ id: authId }, { email }] },
        select: { id: true },
      });
      if (row) return row.id;
    }
    throw e;
  }
}
