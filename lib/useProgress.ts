import { useQuery } from "@tanstack/react-query";
import type { ProgressState } from "@/lib/gamification";

export const PROGRESS_KEY = ["gamification"] as const;

async function getProgress(): Promise<ProgressState> {
  const res = await fetch("/api/gamification");
  if (!res.ok) throw new Error("progress_failed");
  return res.json();
}

// Level, quests, and achievements. Invalidate PROGRESS_KEY after anything
// XP-worthy (a meal, a set) and the server grants whatever was just earned.
export function useProgress() {
  return useQuery({ queryKey: PROGRESS_KEY, queryFn: getProgress, staleTime: 15_000, retry: 1 });
}
