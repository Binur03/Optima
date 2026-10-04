"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserSupabase, supabaseConfigured } from "@/lib/supabase";
import { PROGRESS_PHOTO, compressImage, type CompressedImage } from "@/lib/image";
import { formatDay } from "@/components/charts/GlassTooltip";
import { CompareMode, PhotoCaption, type ProgressPhotoView as Photo } from "@/components/CompareMode";
import { MonthCalendar, localKey } from "@/components/MonthCalendar";
import { ShieldedPhoto } from "@/components/ShieldedPhoto";
import { useUnits } from "@/lib/useUnits";
import { displayToLb, weightUnit } from "@/lib/units";

const BUCKET = "progress-photos";
const SHIELD_KEY = "optima:privacy-shield";

export default function HistoryPage() {
  const qc = useQueryClient();
  const configured = supabaseConfigured();
  const todayKey = localKey(new Date());

  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDate, setUploadDate] = useState(todayKey);
  // Privacy shield: on by default; the choice is remembered on this device.
  const [shield, setShield] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SHIELD_KEY) === "off") setShield(false);
    } catch {
      /* storage unavailable — stay shielded */
    }
  }, []);
  function setShieldPref(on: boolean) {
    setShield(on);
    try {
      localStorage.setItem(SHIELD_KEY, on ? "on" : "off");
    } catch {
      /* storage unavailable — applies to this visit only */
    }
  }
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

  const photoCounts = new Map<string, number>();
  for (const p of photos) photoCounts.set(p.takenOn, (photoCounts.get(p.takenOn) ?? 0) + 1);

  function openUpload(day: string) {
    setComparing(false);
    setUploadDate(day);
    setUploadOpen(true);
  }
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
            onClick={() => setShieldPref(!shield)}
            aria-pressed={shield}
            aria-label={shield ? "Privacy shield on — photos are blurred" : "Privacy shield off — photos are visible"}
            title={shield ? "Privacy shield on" : "Privacy shield off"}
            className={`grid h-9 w-9 place-items-center rounded-full transition ${
              shield ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30" : "bg-neutral-900 text-neutral-400 ring-1 ring-inset ring-white/10 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z" />
              {shield ? <path d="m9 12 2 2 4-4" /> : <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />}
            </svg>
          </button>
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
            onClick={() => (uploadOpen ? setUploadOpen(false) : openUpload(selectedDay ?? todayKey))}
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
          key={uploadDate}
          todayKey={todayKey}
          initialDate={uploadDate}
          onClose={() => setUploadOpen(false)}
          onUploaded={(takenOn) => {
            setUploadOpen(false);
            // Jump the calendar to the photo's month and show that day.
            setMonth(new Date(`${takenOn}T12:00:00`));
            setSelectedDay(takenOn);
            qc.invalidateQueries({ queryKey: ["progress-photos"] });
            qc.invalidateQueries({ queryKey: ["weight-trend"] });
          }}
        />
      )}

      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        photoCounts={photoCounts}
        selected={selectedDay}
        onSelect={setSelectedDay}
        todayKey={todayKey}
      />

      {selectedDay && !comparing && !uploadOpen && (
        <button
          type="button"
          onClick={() => openUpload(selectedDay)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-rose-500/10 py-3 text-sm font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/25 transition hover:bg-rose-500/15"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add photo for {formatDay(selectedDay)}
        </button>
      )}

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
                <ShieldedPhoto
                  src={urls[p.path]}
                  alt={`Progress photo ${formatDay(p.takenOn)}`}
                  shielded={shield}
                  onTap={comparing ? () => togglePick(p.id) : undefined}
                  label={
                    comparing
                      ? `Select photo from ${formatDay(p.takenOn)}`
                      : shield
                        ? `Photo from ${formatDay(p.takenOn)} — press and hold to view`
                        : `Photo from ${formatDay(p.takenOn)}`
                  }
                  className={`${comparing ? "" : "cursor-default"} ${pickIndex >= 0 ? "ring-4 ring-inset ring-emerald-400" : ""}`}
                  caption={(revealed) => <PhotoCaption photo={p} hideWeight={!revealed} />}
                />
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
  initialDate,
  onClose,
  onUploaded,
}: {
  todayKey: string;
  initialDate: string; // the calendar day that was tapped, or today
  onClose: () => void;
  onUploaded: (takenOn: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [takenOn, setTakenOn] = useState(initialDate);
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = photo?.dataUrl ?? null;
  const { units } = useUnits(); // the weight field is typed in the user's unit, stored in lb

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setCompressing(true);
    try {
      // ~150 KB WebP (JPEG on browsers that can't encode WebP) — never the raw 3–8 MB original.
      setPhoto(await compressImage(f, PROGRESS_PHOTO));
    } catch {
      setPhoto(null);
      setError("Couldn’t read that image.");
    } finally {
      setCompressing(false);
    }
  }

  async function upload() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    const supabase = browserSupabase();
    let path: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      path = `${user.id}/${crypto.randomUUID()}.${photo.ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, photo.blob, { contentType: photo.mimeType, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const res = await fetch("/api/progress/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, takenOn, weightLb: weight ? displayToLb(Number(weight), units) : null }),
      });
      if (!res.ok) {
        await supabase.storage.from(BUCKET).remove([path]); // don't leave an orphaned file
        throw new Error("Couldn’t save the photo details.");
      }
      onUploaded(takenOn);
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
          <span className="block py-12">{compressing ? "Optimizing photo…" : "Tap to choose a photo"}</span>
        )}
      </button>
      {photo && (
        <p className="m-0 mt-1.5 text-right text-[11px] tabular-nums text-neutral-500">
          Optimized to {Math.round(photo.bytes / 1024)} KB {photo.ext === "webp" ? "WebP" : "JPEG"}
        </p>
      )}

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
          <span className="text-xs font-medium text-neutral-400">Weight ({weightUnit(units)}, optional)</span>
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={units === "metric" ? "e.g. 78.2" : "e.g. 172.4"}
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
        disabled={!photo || compressing || busy}
        className="mt-4 w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:bg-white/10 disabled:text-neutral-500"
      >
        {busy ? "Uploading…" : "Save photo"}
      </button>
    </section>
  );
}
