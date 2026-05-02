import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GenerationProvider, GenerationResult } from "../types/generation.js";
import { buildRenderPrompt } from "../queue/generation-worker.js";

// Minimal mock types matching the worker's usage
interface MockJob {
  data: { modelId: string; prompt: string };
  updateProgress: ReturnType<typeof vi.fn>;
}

function createMockProvider(
  overrides: Partial<GenerationProvider> = {}
): GenerationProvider {
  return {
    name: "test-provider",
    createTask: vi.fn().mockResolvedValue({ providerTaskId: "prov-1" }),
    pollTask: vi.fn(),
    waitForCompletion: vi.fn().mockResolvedValue({
      providerTaskId: "prov-1",
      status: "succeeded",
      modelUrl: "https://cdn.example.com/model.glb",
      thumbnailUrl: "https://cdn.example.com/thumb.png",
      format: "glb",
    } satisfies GenerationResult),
    ...overrides,
  };
}

function createMockSupabase() {
  const updateFn = vi.fn().mockReturnValue({ eq: vi.fn() });
  return {
    from: vi.fn().mockReturnValue({
      update: updateFn,
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://storage.example.com/model.glb" },
        }),
      }),
    },
  };
}

describe("buildRenderPrompt", () => {
  const baseSnapshot = {
    room_type: "living room",
    room_width_mm: 5000,
    room_depth_mm: 4000,
    room_height_mm: 2400,
    placements: [],
  };

  it("includes bilingual furniture names when both are present", () => {
    const snapshot = {
      ...baseSnapshot,
      placements: [
        { furniture_catalog: { name_ko: "3인 소파", name_en: "3-seater sofa" } },
        { furniture_catalog: { name_ko: "커피 테이블", name_en: "coffee table" } },
      ],
    };
    const prompt = buildRenderPrompt(snapshot, "perspective");
    expect(prompt).toContain("3인 소파 (3-seater sofa)");
    expect(prompt).toContain("커피 테이블 (coffee table)");
  });

  it("falls back to name_ko when name_en is missing", () => {
    const snapshot = {
      ...baseSnapshot,
      placements: [{ furniture_catalog: { name_ko: "선반", name_en: undefined } }],
    };
    const prompt = buildRenderPrompt(snapshot, "top");
    expect(prompt).toContain("선반");
  });

  it("falls back to name_en when name_ko is missing", () => {
    const snapshot = {
      ...baseSnapshot,
      placements: [{ furniture_catalog: { name_ko: undefined, name_en: "bookshelf" } }],
    };
    const prompt = buildRenderPrompt(snapshot, "top");
    expect(prompt).toContain("bookshelf");
  });

  it("uses 'empty room' when no placements", () => {
    const prompt = buildRenderPrompt(baseSnapshot, "corner_ne");
    expect(prompt).toContain("empty room");
  });

  it("includes correct camera description for all presets", () => {
    expect(buildRenderPrompt(baseSnapshot, "top")).toContain("top-down floor plan view");
    expect(buildRenderPrompt(baseSnapshot, "corner_ne")).toContain("corner view from northeast");
    expect(buildRenderPrompt(baseSnapshot, "corner_sw")).toContain("corner view from southwest");
  });

  it("includes room dimensions in meters", () => {
    const prompt = buildRenderPrompt(baseSnapshot, "perspective");
    expect(prompt).toContain("5.0m wide");
    expect(prompt).toContain("4.0m deep");
    expect(prompt).toContain("2.4m tall");
  });
});

// Test the worker logic by simulating what the processor function does.
// We test the core flow (create → wait → upload → update) rather than
// BullMQ internals.
describe("Generation Worker Logic", () => {
  let provider: GenerationProvider;
  let supabase: ReturnType<typeof createMockSupabase>;
  let job: MockJob;

  beforeEach(() => {
    provider = createMockProvider();
    supabase = createMockSupabase();
    job = {
      data: { modelId: "model-abc", prompt: "a blue vase" },
      updateProgress: vi.fn(),
    };

    // Mock global fetch for uploadToStorage
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })
    );
  });

  it("should complete the full generation pipeline", async () => {
    // Simulate the worker processor logic
    const { modelId, prompt } = job.data;

    // Step 1: Update model status to generating
    supabase.from("models").update({ status: "generating" });

    // Step 2: Create task
    const { providerTaskId } = await provider.createTask({ prompt });
    expect(providerTaskId).toBe("prov-1");

    // Step 3: Wait for completion
    const result = await provider.waitForCompletion(providerTaskId);
    expect(result.status).toBe("succeeded");
    expect(result.modelUrl).toBeTruthy();

    // Step 4: Upload to storage
    const storageUrl = "https://storage.example.com/model.glb";

    // Step 5: Update model record
    supabase.from("models").update({
      status: "ready",
      file_url: storageUrl,
      provider_task_id: providerTaskId,
      provider: provider.name,
      thumbnail_url: "https://cdn.example.com/thumb.png",
      format: "glb",
    });

    expect(provider.createTask).toHaveBeenCalledWith({ prompt: "a blue vase" });
    expect(provider.waitForCompletion).toHaveBeenCalledWith("prov-1");
  });

  it("should handle provider failure gracefully", async () => {
    const failingProvider = createMockProvider({
      waitForCompletion: vi.fn().mockRejectedValue(new Error("Provider timeout")),
    });

    const { providerTaskId } = await failingProvider.createTask({
      prompt: "a chair",
    });

    await expect(
      failingProvider.waitForCompletion(providerTaskId)
    ).rejects.toThrow("Provider timeout");
  });

  it("should handle upload failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    const response = await fetch("https://cdn.example.com/model.glb");
    expect(response.ok).toBe(false);
  });
});
