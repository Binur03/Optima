"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function LogPage() {
  const router = useRouter();
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

  const canAnalyze = (!!imageDataUrl || contextText.trim().length >= 2) && !busy;

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

  function reset() {
    setDraft(null);
    setImageDataUrl(undefined);
    setContextText("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // Confirmation step: the estimate is editable before saving.
  if (draft) {
    return (
      <main className="log-page">
        <h1>Review &amp; save</h1>
        <EditableMacroForm
          initial={draft}
          source={source}
          imageDataUrl={source === "AI_IMAGE" ? imageDataUrl : undefined}
          onSaved={() => router.push("/dashboard")}
          onCancel={reset}
        />
      </main>
    );
  }

  return (
    <main className="log-page">
      <h1>Log a meal</h1>
      <p className="log-sub">Add a photo, a description, or both — details make the estimate sharper.</p>

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
          <button type="button" className="ghost" onClick={() => {
            setImageDataUrl(undefined);
            if (fileRef.current) fileRef.current.value = "";
          }}>
            Remove photo
          </button>
        </div>
      ) : (
        <button type="button" className="fab" onClick={() => fileRef.current?.click()}>
          📷 Add photo
        </button>
      )}

      <label className="log-context">
        Meal description or ingredients (optional)
        <input
          type="text"
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canAnalyze && analyze()}
          placeholder="e.g., Chipotle bowl, double chicken, extra guac"
          maxLength={200}
        />
      </label>

      <button className="primary" onClick={analyze} disabled={!canAnalyze}>
        {busy ? "Analyzing…" : "Analyze"}
      </button>

      {error && <p role="alert" className="log-error">{error}</p>}

      <button className="ghost manual-link" onClick={() => startManual()}>
        Enter manually
      </button>
    </main>
  );
}
