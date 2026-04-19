import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";

let client: SupabaseClient | null = null;

export function getSupabaseClient(config: Config): SupabaseClient {
  if (!client) {
    client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
  }
  return client;
}

/**
 * Download a file from a URL and upload it to Supabase Storage.
 * Returns the public URL of the stored file.
 */
export async function uploadToStorage(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
  sourceUrl: string
): Promise<string> {
  // Download the file from the provider
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download model from ${sourceUrl}: ${response.status}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: "model/gltf-binary",
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
