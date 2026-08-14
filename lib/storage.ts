import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// Meal images go to a Supabase Storage bucket; food_logs stores only the URL,
// keeping the table lean (no multi-MB base64 rows). If storage isn't configured
// (env missing), uploads no-op to null so logging still works — we just don't
// keep the photo rather than bloating Postgres with base64.

const BUCKET = "meal-images";

let cached: SupabaseClient | null | undefined;

function serviceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}

export function isStorageConfigured(): boolean {
  return serviceClient() !== null;
}

/**
 * Uploads a base64 data URL to Supabase Storage under `<userId>/<uuid>.<ext>`.
 * Returns the public URL, or null if storage isn't configured / input isn't a data URL.
 */
export async function uploadMealImage(userId: string, dataUrl: string): Promise<string | null> {
  const client = serviceClient();
  if (!client) return null;

  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(dataUrl);
  if (!match) return null;
  const [, mime, b64] = match;

  const subtype = mime.split("/")[1].toLowerCase();
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  const buffer = Buffer.from(b64, "base64");
  const path = `${userId}/${randomUUID()}.${ext}`;

  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (error) throw error;

  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
