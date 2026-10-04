import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UnitSystem } from "@/lib/units";

const KEY = ["units"] as const;

// The signed-in user's unit preference (synced to their account). Defaults to
// imperial until loaded, which is also the account default.
export function useUnits(): { units: UnitSystem; setUnits: (u: UnitSystem) => void; saving: boolean } {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<UnitSystem> => {
      const res = await fetch("/api/profile/units");
      if (!res.ok) return "imperial";
      return (await res.json()).units;
    },
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: async (units: UnitSystem) => {
      const res = await fetch("/api/profile/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units }),
      });
      if (!res.ok) throw new Error("units_failed");
    },
    // Switch instantly; roll back if the save fails.
    onMutate: (units) => {
      const prev = qc.getQueryData<UnitSystem>(KEY);
      qc.setQueryData(KEY, units);
      return { prev };
    },
    onError: (_e, _u, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
  });
  return { units: data ?? "imperial", setUnits: (u) => save.mutate(u), saving: save.isPending };
}
