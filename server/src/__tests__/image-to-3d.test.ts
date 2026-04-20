import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeshyProvider } from "../providers/meshy.js";
import { MockGenerationProvider } from "../providers/mock-generation.js";
import { scaleBufferToDimensions } from "../lib/dimension-scaler.js";
import { validateDimensions, toleranceForSize } from "../lib/dimension-validator.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// MeshyProvider — Image-to-3D API
// ---------------------------------------------------------------------------

describe("MeshyProvider — Image-to-3D", () => {
  let provider: MeshyProvider;

  beforeEach(() => {
    provider = new MeshyProvider("test-api-key");
    mockFetch.mockReset();
  });

  describe("createImageTask", () => {
    it("should create an image-to-3D task with correct payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "img-task-456" }),
      });

      const result = await provider.createImageTask({
        imageUrl: "https://storage.example.com/ref.jpg",
      });

      expect(result.providerTaskId).toBe("img-task-456");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.meshy.ai/v2/image-to-3d",
        expect.objectContaining({ method: "POST" })
      );

      const body = JSON.parse(
        (mockFetch.mock.calls[0]![1] as RequestInit).body as string
      );
      expect(body.image_url).toBe("https://storage.example.com/ref.jpg");
      expect(body.mode).toBe("preview");
      expect(body.should_remesh).toBe(true);
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => "Invalid image URL",
      });

      await expect(
        provider.createImageTask({ imageUrl: "https://bad.url/img.jpg" })
      ).rejects.toThrow("Meshy createImageTask failed (422)");
    });
  });

  describe("pollImageTask", () => {
    it("should poll the image-to-3d endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "img-task-456",
          status: "SUCCEEDED",
          progress: 100,
          model_urls: { glb: "https://cdn.meshy.ai/img-model.glb" },
          thumbnail_url: "https://cdn.meshy.ai/img-thumb.png",
        }),
      });

      const result = await provider.pollImageTask("img-task-456");

      expect(result.status).toBe("succeeded");
      expect(result.modelUrl).toBe("https://cdn.meshy.ai/img-model.glb");
      expect(result.format).toBe("glb");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.meshy.ai/v2/image-to-3d/img-task-456",
        expect.objectContaining({
          headers: { Authorization: "Bearer test-api-key" },
        })
      );
    });

    it("should return pending for in-progress tasks", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "img-task-456",
          status: "IN_PROGRESS",
          progress: 40,
          model_urls: {},
        }),
      });

      const result = await provider.pollImageTask("img-task-456");
      expect(result.status).toBe("in_progress");
      expect(result.progress).toBe(40);
    });
  });

  describe("waitForImageCompletion", () => {
    it("should poll until image task succeeds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "img-task-456",
          status: "IN_PROGRESS",
          progress: 50,
          model_urls: {},
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "img-task-456",
          status: "SUCCEEDED",
          progress: 100,
          model_urls: { glb: "https://cdn.meshy.ai/img-model.glb" },
          thumbnail_url: "https://cdn.meshy.ai/img-thumb.png",
        }),
      });

      const result = await provider.waitForImageCompletion("img-task-456", {
        pollIntervalMs: 10,
      });

      expect(result.status).toBe("succeeded");
      expect(result.modelUrl).toBe("https://cdn.meshy.ai/img-model.glb");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw on image task failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "img-task-456",
          status: "FAILED",
          progress: 0,
          model_urls: {},
        }),
      });

      await expect(
        provider.waitForImageCompletion("img-task-456", { pollIntervalMs: 10 })
      ).rejects.toThrow("Meshy image task img-task-456 failed");
    });

    it("should throw on timeout", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "img-task-456",
          status: "IN_PROGRESS",
          progress: 30,
          model_urls: {},
        }),
      });

      await expect(
        provider.waitForImageCompletion("img-task-456", {
          pollIntervalMs: 10,
          timeoutMs: 50,
        })
      ).rejects.toThrow("timed out");
    });
  });
});

// ---------------------------------------------------------------------------
// MockGenerationProvider — Image-to-3D
// ---------------------------------------------------------------------------

describe("MockGenerationProvider — Image-to-3D", () => {
  let provider: MockGenerationProvider;

  beforeEach(() => {
    provider = new MockGenerationProvider();
  });

  it("should create an image task and return a mock task ID", async () => {
    const result = await provider.createImageTask({
      imageUrl: "https://example.com/test.jpg",
    });
    expect(result.providerTaskId).toMatch(/^mock-img-/);
  });

  it("should immediately succeed on pollImageTask", async () => {
    const result = await provider.pollImageTask("mock-img-123");
    expect(result.status).toBe("succeeded");
    expect(result.progress).toBe(100);
    expect(result.modelUrl).toBeTruthy();
  });

  it("should complete image generation with a model URL", async () => {
    const result = await provider.waitForImageCompletion("mock-img-123", {
      pollIntervalMs: 10,
    });
    expect(result.status).toBe("succeeded");
    expect(result.modelUrl).toBeTruthy();
    expect(result.format).toBe("stl");
  });
});

// ---------------------------------------------------------------------------
// Image-to-3D dimensional accuracy — end-to-end scaling validation
// ---------------------------------------------------------------------------

describe("Image-to-3D dimensional accuracy pipeline", () => {
  /**
   * Simulates the full image-to-3D quality pipeline:
   * 1. Mock provider returns a 50mm cube
   * 2. Scale to target dimensions (like the dimension worker does)
   * 3. Validate dimensional accuracy
   */

  type V3 = [number, number, number];

  function buildBoxStl(wMm: number, hMm: number, dMm: number): Buffer {
    const w = wMm / 2;
    const h = hMm / 2;
    const d = dMm / 2;
    const v: V3[] = [
      [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
      [-w, -h,  d], [w, -h,  d], [w, h,  d], [-w, h,  d],
    ];
    const tris: Array<[V3, V3, V3]> = [
      [v[0]!, v[2]!, v[1]!], [v[0]!, v[3]!, v[2]!],
      [v[4]!, v[5]!, v[6]!], [v[4]!, v[6]!, v[7]!],
      [v[0]!, v[4]!, v[7]!], [v[0]!, v[7]!, v[3]!],
      [v[1]!, v[2]!, v[6]!], [v[1]!, v[6]!, v[5]!],
      [v[0]!, v[1]!, v[5]!], [v[0]!, v[5]!, v[4]!],
      [v[2]!, v[3]!, v[7]!], [v[2]!, v[7]!, v[6]!],
    ];
    const buf = Buffer.alloc(80 + 4 + tris.length * 50);
    buf.write("test box", 0, "ascii");
    buf.writeUInt32LE(tris.length, 80);
    let off = 84;
    for (const tri of tris) {
      buf.writeFloatLE(0, off); buf.writeFloatLE(0, off + 4); buf.writeFloatLE(0, off + 8);
      for (let i = 0; i < 3; i++) {
        buf.writeFloatLE(tri[i]![0], off + 12 + i * 12);
        buf.writeFloatLE(tri[i]![1], off + 12 + i * 12 + 4);
        buf.writeFloatLE(tri[i]![2], off + 12 + i * 12 + 8);
      }
      buf.writeUInt16LE(0, off + 48);
      off += 50;
    }
    return buf;
  }

  it("should pass accuracy check for exact mode scaling", async () => {
    const input = buildBoxStl(50, 50, 50);
    const target = { width_mm: 120, height_mm: 80, depth_mm: 60, mode: "exact" as const };

    const scaled = await scaleBufferToDimensions(input, target, "stl");
    const maxDim = Math.max(target.width_mm, target.height_mm, target.depth_mm);
    const validation = validateDimensions(target, scaled.actualDimensions, toleranceForSize(maxDim));

    expect(validation.passed).toBe(true);
    expect(validation.accuracy_pct).toBeGreaterThanOrEqual(99.5);
    expect(validation.max_error_mm).toBeLessThan(0.5);
  });

  it("should handle small objects within tight tolerance", async () => {
    const input = buildBoxStl(50, 50, 50);
    const target = { width_mm: 30, height_mm: 20, depth_mm: 15, mode: "exact" as const };

    const scaled = await scaleBufferToDimensions(input, target, "stl");
    const maxDim = Math.max(target.width_mm, target.height_mm, target.depth_mm);
    const tolerance = toleranceForSize(maxDim);

    expect(tolerance).toBe(0.3); // tight tolerance for small objects
    const validation = validateDimensions(target, scaled.actualDimensions, tolerance);
    expect(validation.passed).toBe(true);
  });

  it("should handle large objects within relaxed tolerance", async () => {
    const input = buildBoxStl(50, 50, 50);
    const target = { width_mm: 500, height_mm: 300, depth_mm: 250, mode: "exact" as const };

    const scaled = await scaleBufferToDimensions(input, target, "stl");
    const maxDim = Math.max(target.width_mm, target.height_mm, target.depth_mm);
    const tolerance = toleranceForSize(maxDim);

    expect(tolerance).toBe(1.0); // relaxed tolerance for large objects
    const validation = validateDimensions(target, scaled.actualDimensions, tolerance);
    expect(validation.passed).toBe(true);
  });

  it("proportional mode should fit within bounding box", async () => {
    const input = buildBoxStl(50, 50, 50);
    const target = { width_mm: 200, height_mm: 100, depth_mm: 150, mode: "proportional" as const };

    const scaled = await scaleBufferToDimensions(input, target, "stl");

    // Proportional: uniform scale = min(200/50, 100/50, 150/50) = 2.0
    // Actual = 100x100x100 — fits within 200x100x150
    expect(scaled.actualDimensions.width_mm).toBeLessThanOrEqual(target.width_mm + 0.1);
    expect(scaled.actualDimensions.height_mm).toBeLessThanOrEqual(target.height_mm + 0.1);
    expect(scaled.actualDimensions.depth_mm).toBeLessThanOrEqual(target.depth_mm + 0.1);
  });

  describe("quantitative accuracy evaluation across dimension ranges", () => {
    const testCases = [
      { name: "miniature (10mm)", target: { width_mm: 10, height_mm: 8, depth_mm: 6 } },
      { name: "small (50mm)", target: { width_mm: 50, height_mm: 40, depth_mm: 30 } },
      { name: "medium (150mm)", target: { width_mm: 150, height_mm: 120, depth_mm: 80 } },
      { name: "large (500mm)", target: { width_mm: 500, height_mm: 300, depth_mm: 200 } },
      { name: "max (2000mm)", target: { width_mm: 2000, height_mm: 1500, depth_mm: 1000 } },
      { name: "uniform cube (100mm)", target: { width_mm: 100, height_mm: 100, depth_mm: 100 } },
      { name: "thin plate (200x200x5)", target: { width_mm: 200, height_mm: 200, depth_mm: 5 } },
      { name: "tall rod (10x10x300)", target: { width_mm: 10, height_mm: 10, depth_mm: 300 } },
    ];

    for (const tc of testCases) {
      it(`exact mode — ${tc.name}`, async () => {
        const input = buildBoxStl(50, 50, 50);
        const target = { ...tc.target, mode: "exact" as const };
        const scaled = await scaleBufferToDimensions(input, target, "stl");
        const maxDim = Math.max(target.width_mm, target.height_mm, target.depth_mm);
        const validation = validateDimensions(target, scaled.actualDimensions, toleranceForSize(maxDim));

        expect(validation.passed).toBe(true);
        expect(validation.accuracy_pct).toBeGreaterThanOrEqual(99);
      });
    }
  });
});
