// Client-side image compression, done before anything leaves the phone.
// Phone photos are 3–8 MB; Supabase's free tier holds 1 GB, so storing them
// raw fills it in weeks. We resize, then step quality down until the file is
// under a byte budget — WebP where the browser can encode it, else JPEG
// (Safari's canvas can't always produce WebP and silently returns PNG).

export interface CompressedImage {
  blob: Blob;
  dataUrl: string;
  mimeType: "image/webp" | "image/jpeg";
  ext: "webp" | "jpg";
  bytes: number;
}

export interface CompressOptions {
  maxEdge: number; // longest side, px
  targetBytes: number;
}

// Progress photos: crisp on a phone screen, ~150 KB → 6,000+ per GB.
export const PROGRESS_PHOTO: CompressOptions = { maxEdge: 1024, targetBytes: 150_000 };
// Meal photos for Gemini: ≤768 px fits in ONE image tile (258 input tokens) —
// the same cost as 512 px, with more detail for portion estimates.
export const MEAL_PHOTO: CompressOptions = { maxEdge: 768, targetBytes: 100_000 };

const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.44, 0.36];

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file: Blob, { maxEdge, targetBytes }: CompressOptions): Promise<CompressedImage> {
  // "from-image" applies the camera's EXIF rotation, so portraits stay upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let edge = Math.min(maxEdge, Math.max(bitmap.width, bitmap.height));
  let best: Blob | null = null;

  // If even the lowest quality is over budget, shrink the image and try again.
  for (let pass = 0; pass < 3; pass++) {
    const scale = edge / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // Probe WebP support once per pass: an unsupported type comes back as PNG.
    const probe = await toBlob(canvas, "image/webp", QUALITIES[0]);
    const type = probe?.type === "image/webp" ? "image/webp" : "image/jpeg";

    for (const q of QUALITIES) {
      const blob = q === QUALITIES[0] && type === "image/webp" ? probe : await toBlob(canvas, type, q);
      if (!blob) continue;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= targetBytes) {
        bitmap.close();
        return finish(blob);
      }
    }
    edge = Math.round(edge * 0.8);
  }

  bitmap.close();
  if (!best) throw new Error("compress_failed");
  return finish(best); // closest we could get; still far smaller than the original
}

async function finish(blob: Blob): Promise<CompressedImage> {
  const webp = blob.type === "image/webp";
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    mimeType: webp ? "image/webp" : "image/jpeg",
    ext: webp ? "webp" : "jpg",
    bytes: blob.size,
  };
}
