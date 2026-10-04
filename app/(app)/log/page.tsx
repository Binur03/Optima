"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { EditableMacroForm } from "@/components/EditableMacroForm";
import { fileToDownscaledJpeg } from "@/lib/image";
import type { MacroEstimate } from "@/lib/gemini";
import { PROGRESS_KEY } from "@/lib/useProgress";

type Source = "AI_IMAGE" | "MANUAL" | "TEXT_SEARCH";

const BLANK: MacroEstimate = {
  food_name: "",
  estimated_calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  confidence: "low",
};

// Minimal Web Speech API typing (not in the standard DOM lib).
type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export default function LogPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // ---------- Quick Log (natural language + voice) ----------
  const [quickText, setQuickText] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickResult, setQuickResult] = useState<{ count: number; calories: number } | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const voiceSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setQuickText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function quickLog() {
    if (quickText.trim().length < 2) return;
    setQuickBusy(true);
    setQuickError(null);
    setQuickResult(null);
    try {
      const res = await fetch("/api/food/nlp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quickText.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        setQuickError(
          j.error === "no_items"
            ? "Couldn't find any foods in that — try rephrasing."
            : "Couldn't log that — try again."
        );
        return;
      }
      setQuickResult({ count: j.saved, calories: Math.round(j.totals?.calories ?? 0) });
      setQuickText("");
      // Dashboard's macro trackers + Recent Meals refetch on next view.
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["recents"] });
      qc.invalidateQueries({ queryKey: PROGRESS_KEY }, { cancelRefetch: false });
    } catch {
      setQuickError("Network error. Try again.");
    } finally {
      setQuickBusy(false);
    }
  }

  // ---------- Photo / single-item flow ----------
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [contextText, setContextText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MacroEstimate | null>(null);
  const [source, setSource] = useState<Source>("AI_IMAGE");

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImageDataUrl(await fileToDownscaledJpeg(file));
      setError(null);
    } catch {
      setError("Couldn't read that image.");
    }
  }

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const imageBase64 = imageDataUrl ? imageDataUrl.slice(imageDataUrl.indexOf(",") + 1) : undefined;
      const res = await fetch("/api/food/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: "image/jpeg",
          contextText: contextText.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setError("Couldn't analyze that — enter it manually below.");
        startManual(contextText.trim());
        return;
      }
      const { estimate } = (await res.json()) as { estimate: MacroEstimate };
      setSource(imageDataUrl ? "AI_IMAGE" : "TEXT_SEARCH");
      setDraft(estimate);
    } catch {
      setError("Something went wrong.");
      startManual(contextText.trim());
    } finally {
      setBusy(false);
    }
  }

  function startManual(name = "") {
    setSource("MANUAL");
    setDraft({ ...BLANK, food_name: name });
  }

  function resetPhoto() {
    setDraft(null);
    setImageDataUrl(undefined);
    setContextText("");
    if (fileRef.current) fileRef.current.value = "";
  }

  if (draft) {
    return (
      <main className="flex flex-col gap-5 pb-4">
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-white">Review &amp; save</h1>
        <EditableMacroForm
          initial={draft}
          source={source}
          imageDataUrl={source === "AI_IMAGE" ? imageDataUrl : undefined}
          onSaved={() => router.push("/dashboard")}
          onCancel={resetPhoto}
        />
      </main>
    );
  }

  const canAnalyze = (!!imageDataUrl || contextText.trim().length >= 2) && !busy;

  return (
    <main className="flex flex-col gap-6 pb-4">
      <header>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-white">Log a meal</h1>
        <p className="m-0 mt-1 text-sm text-neutral-400">
          Describe it, say it, or snap it — Optima logs every item.
        </p>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPickImage}
      />

      {/* One input surface: text + voice by default; photo mode once an image is attached. */}
      <section className="rounded-3xl border border-white/5 bg-neutral-900/80 shadow-soft transition focus-within:border-emerald-500/30">
        {imageDataUrl ? (
          <div className="p-3">
            <div className="relative overflow-hidden rounded-2xl">
              <img src={imageDataUrl} alt="Your meal" className="block h-56 w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setImageDataUrl(undefined);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur transition hover:bg-black/80"
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              placeholder="Add details (optional) — e.g., double chicken, extra guac"
              maxLength={200}
              className="mt-2 w-full bg-transparent px-2 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3 border-t border-white/5 px-1 pt-3">
              <span className="text-xs text-neutral-500">You’ll review the estimate before saving.</span>
              <button onClick={analyze} disabled={!canAnalyze} className={PRIMARY_BTN}>
                {busy ? "Analyzing…" : "Analyze photo"}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2">
            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="e.g., three eggs, a slice of sourdough toast, and a black coffee"
              rows={4}
              maxLength={500}
              disabled={quickBusy}
              className="block w-full resize-none bg-transparent px-3 py-3 text-base leading-relaxed text-white placeholder:text-neutral-500 focus:outline-none disabled:opacity-60"
            />
            <div className="flex items-center gap-1 border-t border-white/5 px-1 pt-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add a photo"
                disabled={quickBusy}
                className={ICON_BTN}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.6a1 1 0 0 1 .8-.4h3.8a1 1 0 0 1 .8.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
                  <circle cx="12" cy="12.5" r="3.2" />
                </svg>
              </button>
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={quickBusy}
                  aria-label={listening ? "Stop dictation" : "Dictate your meal"}
                  className={
                    listening
                      ? "flex h-10 items-center gap-2 rounded-xl bg-rose-500/15 px-3 text-xs font-semibold text-rose-300"
                      : ICON_BTN
                  }
                >
                  {listening ? (
                    <>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                      Listening…
                    </>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
                    </svg>
                  )}
                </button>
              )}
              <span className="flex-1" />
              <button
                onClick={quickLog}
                disabled={quickBusy || quickText.trim().length < 2}
                className={PRIMARY_BTN}
              >
                {quickBusy ? "Logging…" : "Log meal"}
              </button>
            </div>
          </div>
        )}
      </section>

      {quickError && (
        <p role="alert" className={ERROR_MSG}>
          {quickError}
        </p>
      )}
      {error && (
        <p role="alert" className={ERROR_MSG}>
          {error}
        </p>
      )}
      {quickResult && (
        <p
          role="status"
          className="m-0 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          ✓ Logged {quickResult.count} item{quickResult.count === 1 ? "" : "s"} ·{" "}
          {quickResult.calories.toLocaleString()} kcal —{" "}
          <a href="/dashboard" className="font-semibold text-emerald-200 underline-offset-4 hover:underline">
            view dashboard
          </a>
        </p>
      )}

      <button
        onClick={() => startManual()}
        className="self-center bg-transparent text-sm text-neutral-500 underline-offset-4 transition hover:text-neutral-300 hover:underline"
      >
        Enter manually instead
      </button>
    </main>
  );
}

const PRIMARY_BTN =
  "shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:bg-white/10 disabled:text-neutral-500";
const ICON_BTN =
  "grid h-10 w-10 place-items-center rounded-xl text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40";
const ERROR_MSG =
  "m-0 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300";
