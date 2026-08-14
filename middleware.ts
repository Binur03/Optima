import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Protects the app routes. IMPORTANT: this is self-gating — until the Supabase
// Auth keys exist it no-ops, so building it now can't lock anyone out. Once
// NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are set, it enforces a session and redirects
// unauthenticated users to /login.
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next(); // auth not configured → don't gate

  const res = NextResponse.next();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) =>
        cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/log/:path*", "/diary/:path*", "/history/:path*"],
};
