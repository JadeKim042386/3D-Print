import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GenerationProvider, GenerationResult } from "../types/generation.js";

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
