"use client";

import { formatDay } from "./charts/GlassTooltip";

export interface ProgressPhotoView {
  id: string;
  path: string;
  takenOn: string;
  weightLb: number | null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// Side-by-side Before / After of two progress photos, oldest on the left,
// with days apart and the weight change between them.
export function CompareMode({
  photos,
  urls,
}: {
  photos: ProgressPhotoView[]; // exactly two
  urls: Record<string, string>; // storage path → signed URL
}) {
  const [before, after] = [...photos].sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  const days = daysBetween(before.takenOn, after.takenOn);
  const diff = before.weightLb !== null && after.weightLb !== null ? after.weightLb - before.weightLb : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {[before, after].map((p, i) => (
          <figure key={p.id} className="relative m-0 aspect-[3/4] overflow-hidden rounded-2xl bg-neutral-800">
            {urls[p.path] && (
              <img src={urls[p.path]} alt={`Progress photo ${formatDay(p.takenOn)}`} className="h-full w-full object-cover" />
            )}
            <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
              {i === 0 ? "Before" : "After"}
            </span>
            <PhotoCaption photo={p} />
          </figure>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 divide-x divide-white/5 rounded-2xl bg-white/[0.03] py-3 text-center">
        <div>
          <p className="m-0 text-xl font-bold tabular-nums text-white">{days}</p>
          <p className="m-0 text-[11px] text-neutral-500">days apart</p>
        </div>
        <div>
          <p className="m-0 text-xl font-bold tabular-nums text-white">
            {diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
          </p>
          <p className="m-0 text-[11px] text-neutral-500">lb change</p>
        </div>
      </div>
    </>
  );
}

// Date + weight over a dark gradient so it reads on any photo. `hideWeight`
// keeps the number private while the photo itself is shielded.
export function PhotoCaption({ photo, hideWeight = false }: { photo: ProgressPhotoView; hideWeight?: boolean }) {
  return (
    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-8 text-left">
      <span className="block text-xs font-semibold text-white">{formatDay(photo.takenOn)}</span>
      {photo.weightLb !== null && !hideWeight && (
        <span className="block text-[11px] tabular-nums text-white/70">{photo.weightLb.toFixed(1)} lb</span>
      )}
    </figcaption>
  );
}
