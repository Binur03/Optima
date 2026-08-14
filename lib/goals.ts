import type { Goal } from "@/lib/delta";

// Single source of truth for how a goal maps to a calorie modifier on top of
// the rolling TDEE. Onboarding pre-fills User.goalDelta from this map; the user
// can then fine-tune the number. computeTarget() always reads the stored
// goalDelta, so overrides are respected — this is only the default.
export const DEFAULT_GOAL_DELTAS: Record<Goal, number> = {
  CUT: -500, // TDEE - 500  (deficit)
  MAINTAIN: 0, // TDEE
  BULK: 300, // TDEE + 300  (surplus)
};

export function defaultDeltaForGoal(goal: Goal): number {
  return DEFAULT_GOAL_DELTAS[goal];
}

// Target intake given a maintenance TDEE and a (possibly user-overridden) delta.
export function targetIntakeFor(tdee: number, goalDelta: number): number {
  return tdee + goalDelta;
}
