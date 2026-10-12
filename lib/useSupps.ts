import { useQuery } from "@tanstack/react-query";
import type { TimeOfDay } from "@/lib/supplements";

export interface SuppItem {
  id: string;
  name: string;
  dose: string | null;
  timeOfDay: TimeOfDay;
  takenAt: string | null;
  week: boolean[]; // oldest → today
}

export interface SuppsState {
  today: string;
  days: string[];
  waterGoalMl: number;
  waterMl: number;
  waterEntries: { id: string; amountMl: number; createdAt: string }[];
  supplements: SuppItem[];
}

export const SUPPS_KEY = ["supps"] as const;

export function useSupps() {
  return useQuery({
    queryKey: SUPPS_KEY,
    queryFn: async (): Promise<SuppsState> => {
      const res = await fetch("/api/supplements");
      if (!res.ok) throw new Error("supps_failed");
      return res.json();
    },
  });
}
