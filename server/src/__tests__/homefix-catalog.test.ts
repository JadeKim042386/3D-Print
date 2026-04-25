import { describe, it, expect, vi } from "vitest";
import { homefixCatalogRouter } from "../routes/homefix-catalog.js";

const SOFA: Record<string, unknown> = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  name_ko: "3인 소파",
  name_en: "3-seater sofa",
  category: "소파",
  brand: "이케아",
  width_cm: 220,
  depth_cm: 90,
  height_cm: 85,
  width_mm: 2200,
  depth_mm: 900,
  height_mm: 850,
  price_krw: 450000,
  image_url: "https://cdn.example.com/sofa.jpg",
  affiliate_url: null,
  model_url: null,
  retailer_id: null,
  metadata: {},
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

function makeBuilder(
  rows: unknown[] = [],
  opts: { count?: number; error?: { message: string } | null } = {}
) {
  const { count = rows.length, error = null } = opts;

  // The builder is itself thenable so `await builder.select().order()` works
  // (used by the `categories` procedure which doesn't call .range()/.single())
  const b: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: rows, error, count }),
    single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error }),
    then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error, count }).then(resolve)
    ),
  };
  for (const key of ["select", "eq", "ilike", "gte", "lte", "order"]) {
    (b[key] as ReturnType<typeof vi.fn>).mockReturnValue(b);
  }
  return b;
}

function makeCtx(rows: unknown[] = [], opts?: Parameters<typeof makeBuilder>[1]) {
  const builder = makeBuilder(rows, opts);
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: {
      supabase: { from: vi.fn().mockReturnValue(builder) },
      user: null,
    } as any,
    builder,
  };
}

describe("homefix-catalog — list", () => {
  it("returns items and total from furniture_catalog", async () => {
    const { ctx } = makeCtx([SOFA]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    const result = await caller.list({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name_ko).toBe("3인 소파");
    expect(result.total).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("applies is_active filter", async () => {
    const { ctx, builder } = makeCtx([SOFA]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    await caller.list({});
    expect(builder.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("applies category filter when provided", async () => {
    const { ctx, builder } = makeCtx([SOFA]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    await caller.list({ category: "소파" });
    expect(builder.eq).toHaveBeenCalledWith("category", "소파");
  });

  it("applies Korean name search filter", async () => {
    const { ctx, builder } = makeCtx([SOFA]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    await caller.list({ query: "소파" });
    expect(builder.ilike).toHaveBeenCalledWith("name_ko", "%소파%");
  });

  it("applies pagination via offset and limit", async () => {
    const { ctx, builder } = makeCtx([SOFA]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    await caller.list({ limit: 10, offset: 20 });
    expect(builder.range).toHaveBeenCalledWith(20, 29);
  });

  it("throws INTERNAL_SERVER_ERROR on db error", async () => {
    const { ctx } = makeCtx([], { error: { message: "connection refused" } });
    const caller = homefixCatalogRouter.createCaller(ctx);
    await expect(caller.list({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("homefix-catalog — get", () => {
  it("returns a single furniture item by id", async () => {
    const { ctx } = makeCtx([SOFA]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    const result = await caller.get({ id: SOFA.id as string });
    expect(result.id).toBe(SOFA.id);
    expect(result.width_mm).toBe(2200);
  });

  it("applies is_active filter on single get", async () => {
    const { ctx, builder } = makeCtx([SOFA]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    await caller.get({ id: SOFA.id as string });
    expect(builder.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("throws NOT_FOUND when item missing", async () => {
    const { ctx } = makeCtx([]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    await expect(
      caller.get({ id: "aaaaaaaa-0000-0000-0000-000000000099" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("homefix-catalog — categories", () => {
  it("returns distinct category list", async () => {
    const { ctx } = makeCtx([
      { category: "소파" },
      { category: "침대" },
      { category: "소파" },
    ]);
    const caller = homefixCatalogRouter.createCaller(ctx);
    const result = await caller.categories();
    expect(result).toContain("소파");
    expect(result).toContain("침대");
    expect(new Set(result).size).toBe(result.length); // no duplicates
  });
});
