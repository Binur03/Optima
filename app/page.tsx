import { redirect } from "next/navigation";

// Root: send users into the app. Real auth-gating (redirect to /onboarding when
// no session) lands with middleware in Phase 5.
export default function Home() {
  redirect("/dashboard");
}
