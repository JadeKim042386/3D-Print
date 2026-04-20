/**
 * credits.test.ts
 *
 * Unit tests for credit deduction, admin adjustment, and monthly reset logic.
 * All Supabase calls are mocked — no real DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { deductCredit, adminAdjustCredits, resetFreeCredits, ensureUserCredits } from "../lib/credits.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockRow = {
  id: string;
  user_id: string;
  plan_id: string;
  credits_used: number;
  credits_limit: number;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
};

function makeCreditsRow(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id:            "credit-row-1",
    user_id:       "user-1",
    plan_id:       "free",
    credits_used:  0,
    credits_limit: 3,
    period_start:  "2026-04-01",
    period_end:    "2026-04-30",
    created_at:    "2026-04-01T00:00:00Z",
    updated_at:    "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * Build a fully-chainable Supabase mock that supports any sequence of
 * .select / .insert / .update / .eq / .in / .single calls.
 */
function makeChain(finalData: unknown) {
  const terminal = { data: finalData, error: null };

  // Build a proxy where every method returns `this`, except `.single()`.
  const chain: Record<string, unknown> = {};
  for (const method of ["eq", "in", "not", "order", "range"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain["select"] = vi.fn().mockReturnValue(chain);
  chain["single"] = vi.fn().mockResolvedValue(terminal);
  // Support direct `await` (e.g. `await supabase.from("x").update(...)`)
  chain["then"] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(terminal).then(resolve);
  return chain;
}

function createMockSupabase(options: {
  existingCredits?: MockRow | null;
  updatedCredits?: MockRow | null;
  insertedCredits?: MockRow | null;
  planData?: Record<string, unknown> | null;
  resetRows?: { id: string }[];
  creditRows?: { id: string; user_id: string }[];
}) {
  const {
    existingCredits,
    updatedCredits,
    insertedCredits,
    planData,
    resetRows = [],
    creditRows = [],
  } = options;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "user_credits") {
        return {
          select: vi.fn(() => makeChain(existingCredits)),
          insert: vi.fn(() => makeChain(insertedCredits)),
          update: vi.fn(() => makeChain(updatedCredits)),
        };
      }
      if (table === "subscription_plans") {
        return { select: vi.fn(() => makeChain(planData)) };
      }
      if (table === "credit_transactions") {
        return { insert: vi.fn(() => makeChain(null)) };
      }
      return {
        select: vi.fn(() => makeChain(null)),
        update: vi.fn(() => makeChain(resetRows)),
        insert: vi.fn(() => makeChain(null)),
      };
    }),
  };

  return supabase as unknown as Parameters<typeof deductCredit>[0];
}

// ---------------------------------------------------------------------------
// ensureUserCredits
// ---------------------------------------------------------------------------

describe("ensureUserCredits", () => {
  it("returns existing row when one is found", async () => {
    const row = makeCreditsRow();
    const supabase = createMockSupabase({ existingCredits: row });

    const result = await ensureUserCredits(supabase, "user-1");
    expect(result).toEqual(row);
  });

  it("inserts a free-tier row when none exists", async () => {
    const newRow = makeCreditsRow({ credits_used: 0 });
    const supabase = createMockSupabase({
      existingCredits: null,
      insertedCredits: newRow,
    });

    const result = await ensureUserCredits(supabase, "user-1");
    expect(result).toEqual(newRow);
  });

  it("throws INTERNAL_SERVER_ERROR if insert fails", async () => {
    // Override to return error on insert
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        insert: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        })),
      })),
    } as unknown as Parameters<typeof ensureUserCredits>[0];

    await expect(ensureUserCredits(supabase, "user-1")).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

// ---------------------------------------------------------------------------
// deductCredit
// ---------------------------------------------------------------------------

describe("deductCredit", () => {
  it("deducts a credit successfully when credits remain", async () => {
    const existingRow = makeCreditsRow({ credits_used: 1, credits_limit: 3 });
    const updatedRow  = makeCreditsRow({ credits_used: 2, credits_limit: 3 });
    const supabase = createMockSupabase({
      existingCredits: existingRow,
      updatedCredits:  updatedRow,
    });

    const result = await deductCredit(supabase, "user-1");
    expect(result.credits_used).toBe(2);
  });

  it("throws FORBIDDEN when free-tier credits are exhausted", async () => {
    const exhaustedRow = makeCreditsRow({ credits_used: 3, credits_limit: 3 });
    const supabase = createMockSupabase({ existingCredits: exhaustedRow });

    await expect(deductCredit(supabase, "user-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows unlimited generations for business plan (credits_limit = -1)", async () => {
    const unlimitedRow = makeCreditsRow({
      plan_id:       "business",
      credits_used:  999,
      credits_limit: -1,
    });
    const updatedRow = makeCreditsRow({
      plan_id:       "business",
      credits_used:  1000,
      credits_limit: -1,
    });
    const supabase = createMockSupabase({
      existingCredits: unlimitedRow,
      updatedCredits:  updatedRow,
    });

    const result = await deductCredit(supabase, "user-1");
    expect(result.credits_used).toBe(1000);
  });

  it("deducts from pro plan within its 30-credit limit", async () => {
    const proRow     = makeCreditsRow({ plan_id: "pro", credits_used: 5, credits_limit: 30 });
    const updatedRow = makeCreditsRow({ plan_id: "pro", credits_used: 6, credits_limit: 30 });
    const supabase = createMockSupabase({
      existingCredits: proRow,
      updatedCredits:  updatedRow,
    });

    const result = await deductCredit(supabase, "user-1");
    expect(result.credits_used).toBe(6);
  });

  it("throws FORBIDDEN when pro plan credits are exhausted", async () => {
    const proExhausted = makeCreditsRow({ plan_id: "pro", credits_used: 30, credits_limit: 30 });
    const supabase = createMockSupabase({ existingCredits: proExhausted });

    await expect(deductCredit(supabase, "user-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ---------------------------------------------------------------------------
// adminAdjustCredits
// ---------------------------------------------------------------------------

describe("adminAdjustCredits", () => {
  it("increases credits_used when delta is positive", async () => {
    const existingRow = makeCreditsRow({ credits_used: 2 });
    const updatedRow  = makeCreditsRow({ credits_used: 5 });
    const supabase = createMockSupabase({
      existingCredits: existingRow,
      updatedCredits:  updatedRow,
    });

    const result = await adminAdjustCredits(supabase, "user-1", 3, "admin-1", "penalty");
    expect(result.credits_used).toBe(5);
  });

  it("decreases credits_used when delta is negative (restoring credits)", async () => {
    const existingRow = makeCreditsRow({ credits_used: 3 });
    const updatedRow  = makeCreditsRow({ credits_used: 1 });
    const supabase = createMockSupabase({
      existingCredits: existingRow,
      updatedCredits:  updatedRow,
    });

    const result = await adminAdjustCredits(supabase, "user-1", -2, "admin-1", "correction");
    expect(result.credits_used).toBe(1);
  });

  it("clamps credits_used to 0 (cannot go negative)", async () => {
    const existingRow = makeCreditsRow({ credits_used: 1 });
    // newUsed = max(0, 1 + (-5)) = 0
    const updatedRow = makeCreditsRow({ credits_used: 0 });
    const supabase = createMockSupabase({
      existingCredits: existingRow,
      updatedCredits:  updatedRow,
    });

    const result = await adminAdjustCredits(supabase, "user-1", -5, "admin-1");
    expect(result.credits_used).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resetFreeCredits
// ---------------------------------------------------------------------------

describe("resetFreeCredits", () => {
  it("resets credits_used for free-tier users and returns count", async () => {
    // Simulate 3 free users being reset
    const resetRows = [
      { id: "cr-1" },
      { id: "cr-2" },
      { id: "cr-3" },
    ];
    const creditRows = [
      { id: "cr-1", user_id: "u1" },
      { id: "cr-2", user_id: "u2" },
      { id: "cr-3", user_id: "u3" },
    ];

    // Build a custom mock that handles the two-phase update + select
    let callCount = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "user_credits") {
          callCount++;
          if (callCount === 1) {
            // First call: update .eq("plan_id", "free")
            return {
              update: vi.fn(() => ({
                eq:     vi.fn().mockReturnThis(),
                select: vi.fn().mockResolvedValue({ data: resetRows, error: null }),
              })),
            };
          }
          // Second call: .select("id, user_id").in(...)
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ data: creditRows, error: null }),
            })),
          };
        }
        // credit_transactions insert
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    } as unknown as Parameters<typeof resetFreeCredits>[0];

    const count = await resetFreeCredits(supabase);
    expect(count).toBe(3);
  });

  it("throws when the DB update fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq:     vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        })),
      })),
    } as unknown as Parameters<typeof resetFreeCredits>[0];

    await expect(resetFreeCredits(supabase)).rejects.toThrow("Credit reset failed");
  });
});
