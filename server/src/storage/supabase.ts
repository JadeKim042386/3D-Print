import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";

let client: SupabaseClient | null = null;

export function getSupabaseClient(config: Config): SupabaseClient {
  if (!client) {
    client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
  }
  return client;
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  stl: "model/stl",
  obj: "text/plain",
  fbx: "application/octet-stream",
};

/**
 * Download a file from a URL (http/https or data URI) and upload it to Supabase Storage.
 * Returns the public URL of the stored file.
 */
export async function uploadToStorage(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
  sourceUrl: string
): Promise<string> {
  let buffer: Buffer;

  if (sourceUrl.startsWith("data:")) {
    // data:[<mediatype>][;base64],<data>
    const commaIdx = sourceUrl.indexOf(",");
    if (commaIdx === -1) throw new Error("Malformed data URI");
    const meta = sourceUrl.slice(5, commaIdx);
    const data = sourceUrl.slice(commaIdx + 1);
    buffer = meta.endsWith(";base64")
      ? Buffer.from(data, "base64")
      : Buffer.from(decodeURIComponent(data));
  } else {
    // Download the file from the provider
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download model from ${sourceUrl}: ${response.status}`
      );
    }
    buffer = Buffer.from(await response.arrayBuffer());
  }

  // Infer content type from file extension
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return publicUrl;
}
