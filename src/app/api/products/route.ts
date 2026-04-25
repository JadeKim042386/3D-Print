import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { FurnitureProduct } from "@/types/furniture";

const VALID_CATEGORIES = new Set(["bed", "sofa", "desk", "table", "chair", "storage"]);

function mapRow(row: Record<string, unknown>): FurnitureProduct {
  return {
    id: row.id as string,
    nameKo: row.name_ko as string,
    nameEn: row.name_en as string,
    category: row.category as FurnitureProduct["category"],
    widthCm: row.width_cm as number,
    depthCm: row.depth_cm as number,
    heightCm: row.height_cm as number,
    priceKrw: row.price_krw as number,
    imageUrl: (row.image_url as string | null) ?? undefined,
    affiliateUrl: (row.affiliate_url as string | null) ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category") ?? "all";
  const q = searchParams.get("q") ?? "";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    let query = supabase
      .from("furniture_catalog")
      .select("*")
      .eq("is_active", true)
      .order("name_ko");

    if (category !== "all" && VALID_CATEGORIES.has(category)) {
      query = query.eq("category", category);
    }

    if (q.trim()) {
      query = query.or(`name_ko.ilike.%${q}%,name_en.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[api/products] Supabase error:", error.message);
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }

    const products: FurnitureProduct[] = (data ?? []).map(mapRow);

    return NextResponse.json(products, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate",
      },
    });
  } catch (err) {
    console.error("[api/products] Unexpected error:", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
