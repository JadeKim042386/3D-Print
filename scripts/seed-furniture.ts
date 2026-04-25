/**
 * Seed script: furniture_catalog
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-furniture.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

type ProductRow = {
  name_ko: string;
  name_en: string;
  category: "bed" | "sofa" | "desk" | "table" | "chair" | "storage";
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  price_krw: number;
  image_url?: string;
  affiliate_url?: string;
};

const PRODUCTS: ProductRow[] = [
  // ── Sofa ──────────────────────────────────────────────────────────────────
  {
    name_ko: "3인용 패브릭 소파",
    name_en: "3-Seater Fabric Sofa",
    category: "sofa",
    width_cm: 210, depth_cm: 90, height_cm: 85,
    price_krw: 890000,
    affiliate_url: "https://ohou.se/productions/1234567",
  },
  {
    name_ko: "2인용 가죽 소파",
    name_en: "2-Seater Leather Sofa",
    category: "sofa",
    width_cm: 160, depth_cm: 85, height_cm: 84,
    price_krw: 690000,
    affiliate_url: "https://ohou.se/productions/1234568",
  },
  {
    name_ko: "1인용 리클라이너 소파",
    name_en: "Single Recliner Sofa",
    category: "sofa",
    width_cm: 95, depth_cm: 90, height_cm: 105,
    price_krw: 450000,
    affiliate_url: "https://ohou.se/productions/1234569",
  },
  {
    name_ko: "코너 L형 소파",
    name_en: "L-Shaped Corner Sofa",
    category: "sofa",
    width_cm: 280, depth_cm: 160, height_cm: 85,
    price_krw: 1490000,
    affiliate_url: "https://ohou.se/productions/1234570",
  },
  {
    name_ko: "모듈형 소파 세트",
    name_en: "Modular Sofa Set",
    category: "sofa",
    width_cm: 240, depth_cm: 95, height_cm: 80,
    price_krw: 1200000,
    affiliate_url: "https://ohou.se/productions/1234571",
  },
  {
    name_ko: "벨벳 2인 소파",
    name_en: "Velvet 2-Seater Sofa",
    category: "sofa",
    width_cm: 150, depth_cm: 80, height_cm: 82,
    price_krw: 580000,
    affiliate_url: "https://ohou.se/productions/1234572",
  },

  // ── Bed ───────────────────────────────────────────────────────────────────
  {
    name_ko: "퀸 침대 프레임 (매트리스 미포함)",
    name_en: "Queen Bed Frame (Mattress Not Included)",
    category: "bed",
    width_cm: 168, depth_cm: 215, height_cm: 90,
    price_krw: 450000,
    affiliate_url: "https://ohou.se/productions/2234567",
  },
  {
    name_ko: "킹 침대 프레임 (매트리스 미포함)",
    name_en: "King Bed Frame (Mattress Not Included)",
    category: "bed",
    width_cm: 199, depth_cm: 215, height_cm: 90,
    price_krw: 590000,
    affiliate_url: "https://ohou.se/productions/2234568",
  },
  {
    name_ko: "싱글 침대 수납형",
    name_en: "Single Bed with Storage",
    category: "bed",
    width_cm: 100, depth_cm: 200, height_cm: 85,
    price_krw: 320000,
    affiliate_url: "https://ohou.se/productions/2234569",
  },
  {
    name_ko: "더블 가죽 침대",
    name_en: "Double Leather Bed",
    category: "bed",
    width_cm: 150, depth_cm: 215, height_cm: 95,
    price_krw: 720000,
    affiliate_url: "https://ohou.se/productions/2234570",
  },
  {
    name_ko: "퀸 수납 침대 프레임",
    name_en: "Queen Storage Bed Frame",
    category: "bed",
    width_cm: 168, depth_cm: 215, height_cm: 90,
    price_krw: 680000,
    affiliate_url: "https://ohou.se/productions/2234571",
  },
  {
    name_ko: "패밀리 킹 침대 프레임",
    name_en: "Family King Bed Frame",
    category: "bed",
    width_cm: 210, depth_cm: 215, height_cm: 90,
    price_krw: 750000,
    affiliate_url: "https://ohou.se/productions/2234572",
  },

  // ── Desk ──────────────────────────────────────────────────────────────────
  {
    name_ko: "1200 일자형 책상",
    name_en: "1200mm Straight Desk",
    category: "desk",
    width_cm: 120, depth_cm: 60, height_cm: 75,
    price_krw: 180000,
    affiliate_url: "https://ohou.se/productions/3234567",
  },
  {
    name_ko: "L자형 코너 책상",
    name_en: "L-Shaped Corner Desk",
    category: "desk",
    width_cm: 160, depth_cm: 140, height_cm: 75,
    price_krw: 290000,
    affiliate_url: "https://ohou.se/productions/3234568",
  },
  {
    name_ko: "높이 조절 전동 책상",
    name_en: "Electric Height-Adjustable Desk",
    category: "desk",
    width_cm: 140, depth_cm: 70, height_cm: 125,
    price_krw: 580000,
    affiliate_url: "https://ohou.se/productions/3234569",
  },
  {
    name_ko: "콤팩트 미니 책상",
    name_en: "Compact Mini Desk",
    category: "desk",
    width_cm: 80, depth_cm: 50, height_cm: 75,
    price_krw: 89000,
    affiliate_url: "https://ohou.se/productions/3234570",
  },
  {
    name_ko: "서랍형 원목 책상",
    name_en: "Solid Wood Desk with Drawers",
    category: "desk",
    width_cm: 130, depth_cm: 65, height_cm: 77,
    price_krw: 350000,
    affiliate_url: "https://ohou.se/productions/3234571",
  },

  // ── Table ─────────────────────────────────────────────────────────────────
  {
    name_ko: "4인 원형 식탁",
    name_en: "4-Person Round Dining Table",
    category: "table",
    width_cm: 110, depth_cm: 110, height_cm: 76,
    price_krw: 280000,
    affiliate_url: "https://ohou.se/productions/4234567",
  },
  {
    name_ko: "6인 직사각 식탁",
    name_en: "6-Person Rectangular Dining Table",
    category: "table",
    width_cm: 180, depth_cm: 85, height_cm: 76,
    price_krw: 490000,
    affiliate_url: "https://ohou.se/productions/4234568",
  },
  {
    name_ko: "마블 패턴 커피 테이블",
    name_en: "Marble-Pattern Coffee Table",
    category: "table",
    width_cm: 120, depth_cm: 60, height_cm: 45,
    price_krw: 220000,
    affiliate_url: "https://ohou.se/productions/4234569",
  },
  {
    name_ko: "원목 사이드 테이블",
    name_en: "Solid Wood Side Table",
    category: "table",
    width_cm: 50, depth_cm: 50, height_cm: 55,
    price_krw: 95000,
    affiliate_url: "https://ohou.se/productions/4234570",
  },
  {
    name_ko: "높이 조절 다이닝 테이블",
    name_en: "Height-Adjustable Dining Table",
    category: "table",
    width_cm: 140, depth_cm: 80, height_cm: 76,
    price_krw: 380000,
    affiliate_url: "https://ohou.se/productions/4234571",
  },
  {
    name_ko: "접이식 다용도 테이블",
    name_en: "Folding Multi-Purpose Table",
    category: "table",
    width_cm: 120, depth_cm: 60, height_cm: 72,
    price_krw: 120000,
    affiliate_url: "https://ohou.se/productions/4234572",
  },

  // ── Chair ─────────────────────────────────────────────────────────────────
  {
    name_ko: "패브릭 다이닝 의자 (1개)",
    name_en: "Fabric Dining Chair",
    category: "chair",
    width_cm: 45, depth_cm: 50, height_cm: 85,
    price_krw: 65000,
    affiliate_url: "https://ohou.se/productions/5234567",
  },
  {
    name_ko: "사무용 메쉬 의자",
    name_en: "Mesh Office Chair",
    category: "chair",
    width_cm: 65, depth_cm: 65, height_cm: 120,
    price_krw: 190000,
    affiliate_url: "https://ohou.se/productions/5234568",
  },
  {
    name_ko: "게이밍 의자",
    name_en: "Gaming Chair",
    category: "chair",
    width_cm: 70, depth_cm: 70, height_cm: 130,
    price_krw: 280000,
    affiliate_url: "https://ohou.se/productions/5234569",
  },
  {
    name_ko: "원목 의자 2개 세트",
    name_en: "Solid Wood Chair Set (2pcs)",
    category: "chair",
    width_cm: 45, depth_cm: 48, height_cm: 82,
    price_krw: 160000,
    affiliate_url: "https://ohou.se/productions/5234570",
  },
  {
    name_ko: "북유럽풍 암체어",
    name_en: "Scandinavian Armchair",
    category: "chair",
    width_cm: 75, depth_cm: 80, height_cm: 85,
    price_krw: 320000,
    affiliate_url: "https://ohou.se/productions/5234571",
  },
  {
    name_ko: "바 스툴 (높은 의자) 2개",
    name_en: "Bar Stool Set (2pcs)",
    category: "chair",
    width_cm: 38, depth_cm: 38, height_cm: 75,
    price_krw: 130000,
    affiliate_url: "https://ohou.se/productions/5234572",
  },

  // ── Storage ───────────────────────────────────────────────────────────────
  {
    name_ko: "6단 와이드 책장",
    name_en: "6-Shelf Wide Bookcase",
    category: "storage",
    width_cm: 120, depth_cm: 30, height_cm: 180,
    price_krw: 250000,
    affiliate_url: "https://ohou.se/productions/6234567",
  },
  {
    name_ko: "4단 옷장",
    name_en: "4-Compartment Wardrobe",
    category: "storage",
    width_cm: 150, depth_cm: 55, height_cm: 200,
    price_krw: 590000,
    affiliate_url: "https://ohou.se/productions/6234568",
  },
  {
    name_ko: "슬라이딩 도어 옷장",
    name_en: "Sliding Door Wardrobe",
    category: "storage",
    width_cm: 180, depth_cm: 60, height_cm: 210,
    price_krw: 890000,
    affiliate_url: "https://ohou.se/productions/6234569",
  },
  {
    name_ko: "3단 서랍장",
    name_en: "3-Drawer Chest",
    category: "storage",
    width_cm: 80, depth_cm: 45, height_cm: 90,
    price_krw: 190000,
    affiliate_url: "https://ohou.se/productions/6234570",
  },
  {
    name_ko: "TV 다이닝 거실장",
    name_en: "TV Media Console",
    category: "storage",
    width_cm: 160, depth_cm: 40, height_cm: 50,
    price_krw: 310000,
    affiliate_url: "https://ohou.se/productions/6234571",
  },
  {
    name_ko: "신발장 (6단)",
    name_en: "Shoe Cabinet (6-Tier)",
    category: "storage",
    width_cm: 90, depth_cm: 30, height_cm: 150,
    price_krw: 160000,
    affiliate_url: "https://ohou.se/productions/6234572",
  },
  {
    name_ko: "오픈 선반형 책장",
    name_en: "Open Shelf Bookcase",
    category: "storage",
    width_cm: 80, depth_cm: 25, height_cm: 160,
    price_krw: 130000,
    affiliate_url: "https://ohou.se/productions/6234573",
  },
];

async function main() {
  console.log(`Seeding ${PRODUCTS.length} furniture products…`);

  const { data, error } = await supabase
    .from("furniture_catalog")
    .upsert(PRODUCTS, { onConflict: "id", ignoreDuplicates: false })
    .select("id");

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`Done. Inserted/updated ${data?.length ?? 0} rows.`);
}

main();
