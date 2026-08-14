import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Stable seed user id. NOTE: auth is now strict (Supabase only) — this row is
// no longer reachable via login; it exists purely to hold mock daily_logs/
// food_logs for exercising the TDEE/Delta math in dev.
const DEV_USER_ID = "11111111-1111-1111-1111-111111111111";

// UTC midnight for `daysAgo` days back, matching how the app keys log_date.
function dayUTC(daysAgo: number): Date {
  const n = new Date();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

// 7 days of realistic triathlete burn: heavy training spikes vs. recovery days.
// Day index 0 = today. One day is intentionally "unworn" (850 kcal) to prove the
// <1200 wear-detection filter excludes it from the rolling TDEE.
const BURN_BY_DAY: { caloriesOut: number; steps: number; azm: number; note: string }[] = [
  { caloriesOut: 2850, steps: 9200, azm: 34, note: "today — moderate" },
  { caloriesOut: 3450, steps: 15800, azm: 78, note: "long ride (spike)" },
  { caloriesOut: 2600, steps: 6100, azm: 12, note: "recovery" },
  { caloriesOut: 3200, steps: 13400, azm: 61, note: "brick session" },
  { caloriesOut: 850, steps: 400, azm: 0, note: "watch not worn — should be FILTERED" },
  { caloriesOut: 2950, steps: 10500, azm: 41, note: "tempo run" },
  { caloriesOut: 2700, steps: 7800, azm: 22, note: "swim + easy" },
];

async function main() {
  const user = await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    create: {
      id: DEV_USER_ID,
      email: "dev@macrodelta.test",
      goal: "CUT",       // -500 deficit makes the Delta interesting to look at
      goalDelta: -500,
      heightCm: 180,
      weightKg: 74.5,
      sex: "MALE",
    },
    update: { goal: "CUT", goalDelta: -500 },
  });

  // Daily burn logs (idempotent on user_id + log_date).
  for (let i = 0; i < BURN_BY_DAY.length; i++) {
    const b = BURN_BY_DAY[i];
    const logDate = dayUTC(i);
    await prisma.dailyLog.upsert({
      where: { userId_logDate: { userId: user.id, logDate } },
      create: {
        userId: user.id,
        logDate,
        caloriesOut: b.caloriesOut,
        steps: b.steps,
        activeZoneMinutes: b.azm,
      },
      update: { caloriesOut: b.caloriesOut, steps: b.steps, activeZoneMinutes: b.azm },
    });
  }

  // A few of today's meals so Eaten Today + the DeltaBar have something to show.
  const today = dayUTC(0);
  await prisma.foodLog.deleteMany({ where: { userId: user.id, logDate: today } });
  await prisma.foodLog.createMany({
    data: [
      { userId: user.id, logDate: today, foodName: "Greek yogurt + whey + berries", calories: 340, proteinG: 38, carbsG: 32, fatG: 6, source: "AI_IMAGE", aiEstimated: false },
      { userId: user.id, logDate: today, foodName: "Chicken, sweet potato, greens", calories: 620, proteinG: 52, carbsG: 58, fatG: 16, source: "TEXT_SEARCH", aiEstimated: false },
      { userId: user.id, logDate: today, foodName: "Banana + peanut butter", calories: 290, proteinG: 8, carbsG: 34, fatG: 14, source: "MANUAL", aiEstimated: false },
    ],
  });

  // Report what the rolling TDEE will compute (6 valid days; 850 excluded).
  const valid = BURN_BY_DAY.filter((b) => b.caloriesOut >= 1200).map((b) => b.caloriesOut);
  const tdee = Math.round(valid.reduce((a, c) => a + c, 0) / valid.length);
  console.log(`✓ Seeded user ${user.id}`);
  console.log(`✓ 7 daily logs (1 filtered as unworn). Rolling TDEE ≈ ${tdee} kcal from ${valid.length} valid days`);
  console.log(`✓ Target intake (CUT -500) ≈ ${tdee - 500} kcal · seeded 1250 kcal eaten today`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
