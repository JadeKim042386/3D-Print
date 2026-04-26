/**
 * Verification script: catalog image health check
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-catalog-images.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Exits with code 1 if any broken images are found.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

type Row = { id: string; name_ko: string; image_url: string | null };

async function main() {
  const { data, error } = await supabase
    .from("furniture_catalog")
    .select("id, name_ko, image_url")
    .eq("is_active", true);

  if (error) {
    console.error("Supabase query failed:", error.message);
    process.exit(1);
  }

  const rows: Row[] = (data ?? []).filter((r: Row) => r.image_url);
  console.log(`Checking ${rows.length} active catalog images…\n`);

  const broken: Array<{ id: string; name: string; url: string; status: number | string }> = [];

  await Promise.all(
    rows.map(async (row) => {
      const url = row.image_url!;
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "follow" });
        if (!res.ok) {
          broken.push({ id: row.id, name: row.name_ko, url, status: res.status });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        broken.push({ id: row.id, name: row.name_ko, url, status: msg });
      }
    })
  );

  if (broken.length === 0) {
    console.log(`✓ All ${rows.length} images OK`);
    process.exit(0);
  }

  console.error(`✗ ${broken.length} broken image(s):\n`);
  for (const b of broken) {
    console.error(`  [${b.status}] ${b.name} (${b.id})\n        ${b.url}`);
  }
  process.exit(1);
}

main();
