"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { EditableMacroForm } from "@/components/EditableMacroForm";
import { fileToDownscaledJpeg } from "@/lib/image";
import type { MacroEstimate } from "@/lib/gemini";

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
      <main className="log-page">
        <h1>Review &amp; save</h1>
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
    <main className="log-page">
      <h1>Log a meal</h1>

      {/* Quick Log — natural language + voice */}
      <section className="quick-log">
        <h2>Quick Log</h2>
        <p className="log-sub">Type or speak your whole meal — Optima logs every item at once.</p>
        <div className="quick-log-input">
          <textarea
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="e.g., three eggs, a slice of sourdough toast, and a black coffee"
            rows={3}
            maxLength={500}
            disabled={quickBusy}
          />
          {voiceSupported && (
            <button
              type="button"
              className={`mic-btn${listening ? " mic-listening" : ""}`}
              onClick={toggleMic}
              disabled={quickBusy}
              aria-label={listening ? "Stop dictation" : "Dictate your meal"}
            >
              {listening ? "● Listening…" : "🎤"}
            </button>
          )}
        </div>
        <button
          className="primary"
          onClick={quickLog}
          disabled={quickBusy || quickText.trim().length < 2}
        >
          {quickBusy ? "Logging…" : "Log meal"}
        </button>
        {quickError && <p role="alert" className="log-error">{quickError}</p>}
        {quickResult && (
          <p className="quick-add-ok" role="status">
            ✓ Logged {quickResult.count} item{quickResult.count === 1 ? "" : "s"} ·{" "}
            {quickResult.calories.toLocaleString()} kcal —{" "}
            <a href="/dashboard">view dashboard</a>
          </p>
        )}
      </section>

      <div className="log-divider">or snap a photo</div>

      {/* Photo / single-item flow */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPickImage}
      />
      {imageDataUrl ? (
        <div className="log-image-preview">
          <img src={imageDataUrl} alt="Your meal" />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setImageDataUrl(undefined);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            Remove photo
          </button>
        </div>
      ) : (
        <button type="button" className="fab" onClick={() => fileRef.current?.click()}>
          📷 Add photo
        </button>
      )}

      <label className="log-context">
        Photo description (optional)
        <input
          type="text"
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          placeholder="e.g., double chicken, extra guac"
          maxLength={200}
        />
      </label>
      <button className="ghost" onClick={analyze} disabled={!canAnalyze}>
        {busy ? "Analyzing…" : "Analyze photo"}
      </button>
      {error && <p role="alert" className="log-error">{error}</p>}
      <button className="ghost manual-link" onClick={() => startManual()}>
        Enter manually
      </button>
    </main>
  );
}
