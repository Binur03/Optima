// Client-side image downscaling. Mobile photos are 3-10MB; we shrink to a
// 1024px JPEG before upload so we stay under the analyze route's 5MB guard and
// keep Gemini latency/cost down. Returns a `data:image/jpeg;base64,...` URL.
export async function fileToDownscaledJpeg(file: File, maxEdge = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}
