import type {
  GenerationProvider,
  GenerationRequest,
  GenerationPollResult,
  GenerationResult,
} from "../types/generation.js";

// A minimal valid ASCII STL — a single triangle (tetrahedron face)
const SAMPLE_STL_URL =
  "https://raw.githubusercontent.com/nicktindall/cyclon.p2p/master/test/fixtures/cube.stl";

/**
 * Mock 3D generation provider for local development and prototyping.
 * Returns a sample STL after a short simulated delay. No API key required.
 */
export class MockGenerationProvider implements GenerationProvider {
  readonly name = "mock";

  async createTask(request: GenerationRequest): Promise<{ providerTaskId: string }> {
    console.log(`[MockProvider] Received prompt: "${request.prompt}"`);
    const taskId = `mock-${Date.now()}`;
    return { providerTaskId: taskId };
  }

  async pollTask(providerTaskId: string): Promise<GenerationPollResult> {
    return {
      providerTaskId,
      status: "succeeded",
      progress: 100,
      modelUrl: SAMPLE_STL_URL,
      thumbnailUrl: null,
      format: "stl",
    };
  }

  async waitForCompletion(
    providerTaskId: string,
    opts?: { pollIntervalMs?: number; timeoutMs?: number }
  ): Promise<GenerationResult> {
    // Simulate a brief generation delay so the polling UI flow feels real
    const delay = Math.min(opts?.pollIntervalMs ?? 2000, 3000);
    await new Promise((res) => setTimeout(res, delay));

    return {
      providerTaskId,
      status: "succeeded",
      modelUrl: SAMPLE_STL_URL,
      thumbnailUrl: null,
      format: "stl",
    };
  }
}
