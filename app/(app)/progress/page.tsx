import { redirect } from "next/navigation";

// Progress photos moved to /history — keep old links and installed shortcuts working.
export default function ProgressRedirect({ searchParams }: { searchParams: { add?: string } }) {
  redirect(searchParams.add ? "/history?add=1" : "/history");
}
