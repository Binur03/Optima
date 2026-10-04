"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserSupabase, supabaseConfigured } from "@/lib/supabase";
import { fileToDownscaledJpeg } from "@/lib/image";
import { formatDay } from "@/components/charts/GlassTooltip";
import { CompareMode, PhotoCaption, type ProgressPhotoView as Photo } from "@/components/CompareMode";

const BUCKET = "progress-photos";

// Local calendar day as "YYYY-MM-DD".
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay()); // Sunday
  return s;
}
export default function HistoryPage() {
  const qc = useQueryClient();
  const configured = supabaseConfigured();
  const todayKey = localKey(new Date());

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);

  // The "+" sheet links here with ?add=1 to open the upload card directly.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add")) setUploadOpen(true);
  }, []);

  const photosQuery = useQuery({
    queryKey: ["progress-photos"],
    queryFn: async (): Promise<Photo[]> => {
      const res = await fetch("/api/progress/photos");
      if (!res.ok) throw new Error("photos_failed");
      return (await res.json()).photos;
    },
  });
  const photos = useMemo(() => photosQuery.data ?? [], [photosQuery.data]);
  const paths = photos.map((p) => p.path);

  // Private bucket → short-lived signed URLs, minted with the user's own session
  // (Storage RLS only lets them sign files in their own folder).
  const urlsQuery = useQuery({
    queryKey: ["progress-urls", paths],
    enabled: configured && paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await browserSupabase().storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const entries: [string, string][] = [];
      for (const d of data ?? []) if (d.path && d.signedUrl) entries.push([d.path, d.signedUrl]);
      return Object.fromEntries(entries);
    },
  });
  const urls = urlsQuery.data ?? {};

  const removePhoto = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/progress/photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      const { path } = (await res.json()) as { path: string };
      await browserSupabase().storage.from(BUCKET).remove([path]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["progress-photos"] }),
  });

  const photoDays = new Set(photos.map((p) => p.takenOn));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const visible = selectedDay ? photos.filter((p) => p.takenOn === selectedDay) : photos;
  const compared = picks.map((id) => photos.find((p) => p.id === id)).filter((p): p is Photo => !!p);

  function togglePick(id: string) {
    setPicks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]));
  }

  if (!configured) {
    return (
      <p className="mt-24 rounded-3xl border border-white/5 bg-neutral-900 p-6 text-center text-sm text-neutral-400">
        Progress photos need Supabase Storage. Add your Supabase keys to enable them.
      </p>
    );
  }

  return (
    <main className="flex flex-col gap-5 pb-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white">History</h1>
          <p className="m-0 mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Private to you
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setComparing((c) => !c);
              setPicks([]);
            }}
            disabled={photos.length < 2}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
              comparing ? "bg-white text-zinc-950" : "bg-neutral-900 text-neutral-300 ring-1 ring-inset ring-white/10 hover:text-white"
            }`}
          >
            {comparing ? "Done" : "Compare"}
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen((o) => !o)}
            aria-label="Add progress photo"
            className="grid h-9 w-9 place-items-center rounded-full bg-rose-500 text-white transition hover:bg-rose-400"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      {uploadOpen && (
        <UploadCard
          todayKey={todayKey}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            qc.invalidateQueries({ queryKey: ["progress-photos"] });
            qc.invalidateQueries({ queryKey: ["weight-trend"] });
          }}
        />
      )}

      {/* Weekly strip */}
      <section className="rounded-3xl border border-white/5 bg-neutral-900 p-4" aria-label="Photo calendar">
        <div className="mb-3 flex items-center justify-between px-1">
          <button type="button" onClick={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() - 7))} aria-label="Previous week" className={ARROW}>
            ‹
          </button>
          <p className="m-0 text-sm font-semibold text-white">
            {week[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
            {week[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <button
            type="button"
            onClick={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7))}
            disabled={localKey(week[6]) >= todayKey}
            aria-label="Next week"
            className={ARROW}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {week.map((d) => {
            const key = localKey(d);
            const has = photoDays.has(key);
            const selected = selectedDay === key;
            const future = key > todayKey;
            return (
              <button
                key={key}
                type="button"
                disabled={future}
                onClick={() => setSelectedDay(selected ? null : key)}
                aria-pressed={selected}
                aria-label={`${d.toDateString()}${has ? ", has photos" : ""}`}
                className={`flex flex-col items-center gap-1 rounded-2xl py-2 transition disabled:opacity-30 ${
                  selected ? "bg-white/10" : "hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-[10px] font-medium uppercase text-neutral-500">
                  {d.toLocaleDateString("en-US", { weekday: "narrow" })}
                </span>
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold tabular-nums ${
                    key === todayKey ? "bg-white text-zinc-950" : "text-white"
                  }`}
                >
                  {d.getDate()}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${has ? "bg-rose-400 shadow-[0_0_8px_2px_rgba(251,113,133,0.7)]" : "bg-transparent"}`}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </section>

      {/* Compare view */}
      {comparing && (
        <section className="rounded-3xl border border-white/5 bg-neutral-900 p-4" aria-label="Compare photos">
          {compared.length < 2 ? (
            <p className="m-0 py-2 text-center text-sm text-neutral-400">
              {compared.length === 0 ? "Tap your baseline photo below." : "Now tap your current photo."}
            </p>
          ) : (
            <CompareMode photos={compared} urls={urls} />
          )}
        </section>
      )}

      {/* Masonry gallery */}
      {photosQuery.isLoading ? (
        <div className="columns-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`mb-3 animate-pulse rounded-3xl bg-white/5 ${i % 2 ? "h-56" : "h-72"}`} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center">
          <p className="m-0 text-sm text-neutral-400">
            {selectedDay ? `No photos on ${formatDay(selectedDay)}.` : "No progress photos yet."}
          </p>
          {!selectedDay && (
            <button type="button" onClick={() => setUploadOpen(true)} className="mt-3 text-sm font-semibold text-rose-300 hover:underline">
              Add your first photo
            </button>
          )}
        </div>
      ) : (
        <div className="columns-2 gap-3">
          {visible.map((p) => {
            const pickIndex = picks.indexOf(p.id);
            return (
              <div key={p.id} className="relative mb-3 break-inside-avoid overflow-hidden rounded-3xl bg-neutral-900">
                <button
                  type="button"
                  disabled={!comparing}
                  onClick={() => togglePick(p.id)}
                  aria-label={comparing ? `Select photo from ${formatDay(p.takenOn)}` : undefined}
                  className={`block w-full disabled:cursor-default ${pickIndex >= 0 ? "ring-4 ring-inset ring-emerald-400" : ""}`}
                >
                  {urls[p.path] ? (
                    <img src={urls[p.path]} alt={`Progress photo ${formatDay(p.takenOn)}`} loading="lazy" className="block w-full" />
                  ) : (
                    <div className="aspect-[3/4] animate-pulse bg-white/5" />
                  )}
                  <PhotoCaption photo={p} />
                </button>
                {comparing && pickIndex >= 0 && (
                  <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-emerald-400 text-sm font-bold text-zinc-950">
                    {pickIndex + 1}
                  </span>
                )}
                {!comparing && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this photo? This can’t be undone.")) removePhoto.mutate(p.id);
                    }}
                    disabled={removePhoto.isPending}
                    aria-label={`Delete photo from ${formatDay(p.takenOn)}`}
                    className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white/80 backdrop-blur transition hover:bg-rose-500 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {urlsQuery.isError && (
        <p role="alert" className="m-0 text-center text-xs text-rose-400">
          Couldn’t load your photos — try refreshing.
        </p>
      )}
    </main>
  );
}

function UploadCard({
  todayKey,
  onClose,
  onUploaded,
}: {
  todayKey: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [takenOn, setTakenOn] = useState(todayKey);
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    try {
      setPreview(await fileToDownscaledJpeg(f, 1600));
    } catch {
      setError("Couldn’t read that image.");
    }
  }

  async function upload() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const supabase = browserSupabase();
    let path: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const blob = await (await fetch(preview)).blob();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const res = await fetch("/api/progress/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, takenOn, weightLb: weight ? Number(weight) : null }),
      });
      if (!res.ok) {
        await supabase.storage.from(BUCKET).remove([path]); // don't leave an orphaned file
        throw new Error("Couldn’t save the photo details.");
      }
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/5 bg-neutral-900 p-5 shadow-soft" aria-label="Add progress photo">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="m-0 text-base font-semibold text-white">New progress photo</h2>
        <button type="button" onClick={onClose} className="text-sm text-neutral-500 hover:text-white">
          Cancel
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="block w-full overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.02] text-sm text-neutral-400 transition hover:border-white/30"
      >
        {preview ? (
          <img src={preview} alt="Selected progress photo" className="block max-h-80 w-full object-cover" />
        ) : (
          <span className="block py-12">Tap to choose a photo</span>
        )}
      </button>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-neutral-400">Date</span>
          <input
            type="date"
            value={takenOn}
            max={todayKey}
            onChange={(e) => setTakenOn(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:border-rose-400/50 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-neutral-400">Weight (lb, optional)</span>
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="e.g. 172.4"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm tabular-nums text-white placeholder:text-neutral-600 focus:border-rose-400/50 focus:outline-none"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="m-0 mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={upload}
        disabled={!file || !preview || busy}
        className="mt-4 w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:bg-white/10 disabled:text-neutral-500"
      >
        {busy ? "Uploading…" : "Save photo"}
      </button>
    </section>
  );
}

const ARROW =
  "grid h-8 w-8 place-items-center rounded-full text-lg text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:opacity-30";
