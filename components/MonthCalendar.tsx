"use client";

// Local calendar day as "YYYY-MM-DD".
export function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  month: Date; // any day in the month to show
  onMonthChange: (firstOfMonth: Date) => void;
  photoCounts: Map<string, number>; // "YYYY-MM-DD" → photos that day
  selected: string | null;
  onSelect: (day: string | null) => void;
  todayKey: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Month grid with a glowing dot on days that have photos. Future days are
// disabled; tapping a day selects it (tap again to clear).
export function MonthCalendar({ month, onMonthChange, photoCounts, selected, onSelect, todayKey }: Props) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
  ];
  const isCurrentMonth = localKey(first).slice(0, 7) >= todayKey.slice(0, 7);
  const monthPhotos = [...photoCounts].reduce(
    (sum, [day, n]) => (day.startsWith(localKey(first).slice(0, 7)) ? sum + n : sum),
    0
  );
  const shift = (n: number) => onMonthChange(new Date(first.getFullYear(), first.getMonth() + n, 1));

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900 p-4" aria-label="Photo calendar">
      <div className="mb-3 flex items-center justify-between px-1">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className={ARROW}>
          ‹
        </button>
        <div className="text-center">
          <p className="m-0 text-sm font-semibold text-white">
            {first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
          <p className="m-0 text-[11px] text-neutral-500">
            {monthPhotos === 0 ? "No photos" : `${monthPhotos} photo${monthPhotos === 1 ? "" : "s"}`}
          </p>
        </div>
        <button type="button" onClick={() => shift(1)} disabled={isCurrentMonth} aria-label="Next month" className={ARROW}>
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center" role="grid">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="pb-1 text-[10px] font-medium uppercase text-neutral-500" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`blank-${i}`} />;
          const key = localKey(d);
          const count = photoCounts.get(key) ?? 0;
          const isSelected = selected === key;
          const future = key > todayKey;
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              onClick={() => onSelect(isSelected ? null : key)}
              aria-pressed={isSelected}
              aria-label={`${d.toDateString()}${count ? `, ${count} photo${count === 1 ? "" : "s"}` : ""}`}
              className="flex flex-col items-center gap-0.5 py-0.5 disabled:opacity-25"
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold tabular-nums transition ${
                  isSelected
                    ? "bg-rose-500 text-white"
                    : key === todayKey
                      ? "bg-white text-zinc-950"
                      : "text-white hover:bg-white/[0.06]"
                }`}
              >
                {d.getDate()}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${count ? "bg-rose-400 shadow-[0_0_8px_2px_rgba(251,113,133,0.7)]" : "bg-transparent"}`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

const ARROW =
  "grid h-8 w-8 place-items-center rounded-full text-lg text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:opacity-30";
