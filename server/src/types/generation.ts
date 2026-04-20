/** Supported 3D output formats */
export type OutputFormat = "stl" | "obj" | "glb" | "fbx";

/** Scaling strategy for dimensional post-processing */
export type ScalingMode = "proportional" | "exact";

/**
 * Physical dimension constraints specified by the user (all in mm).
 * When provided, the generated mesh is post-processed to match these dimensions.
 */
export interface DimensionSpec {
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  /** Default: "proportional" — preserves shape; "exact" applies per-axis scale */
  mode?: ScalingMode;
}

/** Measured AABB dimensions of a mesh (mm). */
export interface MeshDimensions {
  width_mm: number;
  height_mm: number;
  depth_mm: number;
}

/**
 * Result of dimensional post-processing: what was requested vs what was measured,
 * and an accuracy score.
 */
export interface DimensionResult {
  requested: MeshDimensions;
  actual: MeshDimensions;
  /** 100 = exact match; lower = larger deviation */
  accuracy_pct: number;
  /** Max absolute error in mm across all three axes */
  max_error_mm: number;
  /** Whether the result passed the accuracy threshold */
  passed: boolean;
}

/** Status of a generation task on the provider side */
export type GenerationStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed";

/** Request to create a 3D model from text */
export interface GenerationRequest {
  prompt: string;
  format?: OutputFormat;
}

/** Result returned after a generation completes */
export interface GenerationResult {
  providerTaskId: string;
  status: GenerationStatus;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  format: OutputFormat;
  /** All available format URLs from the provider (e.g. Meshy returns glb, obj, stl, fbx) */
  allModelUrls?: Record<string, string>;
}

/** Polling result for an in-progress task */
export interface GenerationPollResult {
  providerTaskId: string;
  status: GenerationStatus;
  progress: number;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  format: OutputFormat;
  /** All available format URLs from the provider */
  allModelUrls?: Record<string, string>;
}

/**
 * Abstract interface for 3D generation providers.
 * Implement this to add new providers (Meshy.ai, Tripo3D, etc.)
 */
export interface GenerationProvider {
  readonly name: string;

  /** Start a text-to-3D generation task */
  createTask(request: GenerationRequest): Promise<{ providerTaskId: string }>;

  /** Poll for task status */
  pollTask(providerTaskId: string): Promise<GenerationPollResult>;

  /** Poll until terminal state, with configurable interval */
  waitForCompletion(
    providerTaskId: string,
    opts?: { pollIntervalMs?: number; timeoutMs?: number }
  ): Promise<GenerationResult>;
}

/** Request to create a 3D model from a reference image */
export interface ImageGenerationRequest {
  imageUrl: string;
}

/**
 * Extended provider interface for image-to-3D generation.
 * Providers that support this should implement both interfaces.
 */
export interface ImageGenerationProvider {
  /** Start an image-to-3D generation task */
  createImageTask(request: ImageGenerationRequest): Promise<{ providerTaskId: string }>;

  /** Poll for image-to-3D task status */
  pollImageTask(providerTaskId: string): Promise<GenerationPollResult>;

  /** Poll image-to-3D task until terminal state */
  waitForImageCompletion(
    providerTaskId: string,
    opts?: { pollIntervalMs?: number; timeoutMs?: number }
  ): Promise<GenerationResult>;
}
