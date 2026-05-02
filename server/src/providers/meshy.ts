import type {
  GenerationProvider,
  GenerationRequest,
  GenerationPollResult,
  GenerationResult,
  OutputFormat,
  ImageGenerationProvider,
  ImageGenerationRequest,
} from "../types/generation.js";

interface MeshyCreateResponse {
  result: string; // task ID
}

interface MeshyTaskResponse {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  progress: number;
  model_urls?: {
    glb?: string;
    obj?: string;
    stl?: string;
    fbx?: string;
  };
  thumbnail_url?: string;
}

const STATUS_MAP: Record<string, GenerationPollResult["status"]> = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
};

export class MeshyProvider implements GenerationProvider, ImageGenerationProvider {
  readonly name = "meshy";
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.meshy.ai/v2";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createTask(
    request: GenerationRequest
  ): Promise<{ providerTaskId: string }> {
    const res = await fetch(`${this.baseUrl}/text-to-3d`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "preview",
        prompt: request.prompt,
        art_style: "realistic",
        should_remesh: true,
        ...(request.negative_prompt !== undefined && { negative_prompt: request.negative_prompt }),
        ...(request.seed !== undefined && { seed: request.seed }),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meshy createTask failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as MeshyCreateResponse;
    return { providerTaskId: data.result };
  }

  async pollTask(providerTaskId: string): Promise<GenerationPollResult> {
    const res = await fetch(
      `${this.baseUrl}/text-to-3d/${providerTaskId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meshy pollTask failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as MeshyTaskResponse;
    const format: OutputFormat = "glb";

    // Collect all available format URLs from the provider
    const allModelUrls: Record<string, string> = {};
    if (data.model_urls) {
      for (const [fmt, url] of Object.entries(data.model_urls)) {
        if (url) allModelUrls[fmt] = url;
      }
    }

    return {
      providerTaskId: data.id,
      status: STATUS_MAP[data.status] ?? "pending",
      progress: data.progress,
      modelUrl: data.model_urls?.glb ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
      format,
      allModelUrls: Object.keys(allModelUrls).length > 0 ? allModelUrls : undefined,
    };
  }

  async waitForCompletion(
    providerTaskId: string,
    opts?: { pollIntervalMs?: number; timeoutMs?: number }
  ): Promise<GenerationResult> {
    const pollInterval = opts?.pollIntervalMs ?? 5000;
    const timeout = opts?.timeoutMs ?? 600_000; // 10 min default
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const result = await this.pollTask(providerTaskId);

      if (result.status === "succeeded") {
        return {
          providerTaskId: result.providerTaskId,
          status: "succeeded",
          modelUrl: result.modelUrl,
          thumbnailUrl: result.thumbnailUrl,
          format: result.format,
          allModelUrls: result.allModelUrls,
        };
      }

      if (result.status === "failed") {
        throw new Error(
          `Meshy task ${providerTaskId} failed`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Meshy task ${providerTaskId} timed out after ${timeout}ms`
    );
  }

  // ---- Image-to-3D methods ----

  async createImageTask(
    request: ImageGenerationRequest
  ): Promise<{ providerTaskId: string }> {
    const res = await fetch(`${this.baseUrl}/image-to-3d`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: request.imageUrl,
        mode: "preview",
        should_remesh: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meshy createImageTask failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as MeshyCreateResponse;
    return { providerTaskId: data.result };
  }

  async pollImageTask(providerTaskId: string): Promise<GenerationPollResult> {
    const res = await fetch(
      `${this.baseUrl}/image-to-3d/${providerTaskId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meshy pollImageTask failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as MeshyTaskResponse;
    const format: OutputFormat = "glb";

    const allModelUrls: Record<string, string> = {};
    if (data.model_urls) {
      for (const [fmt, url] of Object.entries(data.model_urls)) {
        if (url) allModelUrls[fmt] = url;
      }
    }

    return {
      providerTaskId: data.id,
      status: STATUS_MAP[data.status] ?? "pending",
      progress: data.progress,
      modelUrl: data.model_urls?.glb ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
      format,
      allModelUrls: Object.keys(allModelUrls).length > 0 ? allModelUrls : undefined,
    };
  }

  async waitForImageCompletion(
    providerTaskId: string,
    opts?: { pollIntervalMs?: number; timeoutMs?: number }
  ): Promise<GenerationResult> {
    const pollInterval = opts?.pollIntervalMs ?? 5000;
    const timeout = opts?.timeoutMs ?? 600_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const result = await this.pollImageTask(providerTaskId);

      if (result.status === "succeeded") {
        return {
          providerTaskId: result.providerTaskId,
          status: "succeeded",
          modelUrl: result.modelUrl,
          thumbnailUrl: result.thumbnailUrl,
          format: result.format,
          allModelUrls: result.allModelUrls,
        };
      }

      if (result.status === "failed") {
        throw new Error(`Meshy image task ${providerTaskId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Meshy image task ${providerTaskId} timed out after ${timeout}ms`
    );
  }
}
