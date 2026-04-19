import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeshyProvider } from "../providers/meshy.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("MeshyProvider", () => {
  let provider: MeshyProvider;

  beforeEach(() => {
    provider = new MeshyProvider("test-api-key");
    mockFetch.mockReset();
  });

  describe("createTask", () => {
    it("should create a text-to-3D task and return providerTaskId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "task-123" }),
      });

      const result = await provider.createTask({ prompt: "a red chair" });

      expect(result.providerTaskId).toBe("task-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.meshy.ai/v2/text-to-3d",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          },
        })
      );

      const body = JSON.parse(
        (mockFetch.mock.calls[0]![1] as RequestInit).body as string
      );
      expect(body.prompt).toBe("a red chair");
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      await expect(
        provider.createTask({ prompt: "a red chair" })
      ).rejects.toThrow("Meshy createTask failed (400)");
    });
  });

  describe("pollTask", () => {
    it("should return mapped status for an in-progress task", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-123",
          status: "IN_PROGRESS",
          progress: 50,
          model_urls: {},
          thumbnail_url: null,
        }),
      });

      const result = await provider.pollTask("task-123");

      expect(result.status).toBe("in_progress");
      expect(result.progress).toBe(50);
      expect(result.modelUrl).toBeNull();
    });

    it("should return model URL for a succeeded task", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-123",
          status: "SUCCEEDED",
          progress: 100,
          model_urls: { glb: "https://cdn.meshy.ai/model.glb" },
          thumbnail_url: "https://cdn.meshy.ai/thumb.png",
        }),
      });

      const result = await provider.pollTask("task-123");

      expect(result.status).toBe("succeeded");
      expect(result.modelUrl).toBe("https://cdn.meshy.ai/model.glb");
      expect(result.thumbnailUrl).toBe("https://cdn.meshy.ai/thumb.png");
    });
  });

  describe("waitForCompletion", () => {
    it("should poll until task succeeds", async () => {
      // First poll: in progress
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-123",
          status: "IN_PROGRESS",
          progress: 50,
          model_urls: {},
        }),
      });

      // Second poll: succeeded
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-123",
          status: "SUCCEEDED",
          progress: 100,
          model_urls: { glb: "https://cdn.meshy.ai/model.glb" },
          thumbnail_url: "https://cdn.meshy.ai/thumb.png",
        }),
      });

      const result = await provider.waitForCompletion("task-123", {
        pollIntervalMs: 10,
      });

      expect(result.status).toBe("succeeded");
      expect(result.modelUrl).toBe("https://cdn.meshy.ai/model.glb");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw on task failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-123",
          status: "FAILED",
          progress: 0,
          model_urls: {},
        }),
      });

      await expect(
        provider.waitForCompletion("task-123", { pollIntervalMs: 10 })
      ).rejects.toThrow("Meshy task task-123 failed");
    });

    it("should throw on timeout", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "task-123",
          status: "IN_PROGRESS",
          progress: 50,
          model_urls: {},
        }),
      });

      await expect(
        provider.waitForCompletion("task-123", {
          pollIntervalMs: 10,
          timeoutMs: 50,
        })
      ).rejects.toThrow("timed out");
    });
  });
});
