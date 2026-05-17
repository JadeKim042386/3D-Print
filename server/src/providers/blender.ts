/**
 * blender.ts — BlenderProvider for homefix procedural rendering (DPR-247 / DPR-248).
 *
 * Unlike Meshy (external HTTPS API), Blender rendering runs in our own Celery
 * worker fleet (`homefix-render-worker` Fly app, `render/tasks.py`). This
 * provider's job is to:
 *   1. Mark the existing `homefix_render_jobs` row (already INSERTed by the
 *      tRPC route before BullMQ enqueue) with `provider='blender'`.
 *   2. Push a Celery v5 task envelope onto the Redis queue
 *      (`homefix-render-fast` for preview, `homefix-render-slow` for final).
 *   3. Poll the row until the Celery worker sets `status='completed'` or
 *      `status='failed'` and writes back `result_url`.
 *
 * The Celery worker uploads the rendered PNG to Supabase Storage itself, so
 * the BullMQ side does NOT re-upload — it simply propagates the existing
 * `result_url`.
 */
import { randomUUID, createHash } from "node:crypto";
import IORedis from "ioredis";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BlenderQuality = "preview" | "final";

export interface BlenderEnqueueInput {
  /** UUID of the homefix_render_jobs row already created by the API route. */
  homefixRenderJobId: string;
  /** preview → homefix-render-fast (128 samples); final → homefix-render-slow (512 samples). */
  quality?: BlenderQuality;
}

export interface BlenderWaitOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface BlenderWaitResult {
  status: "completed" | "failed";
  resultUrl: string | null;
  errorMessage: string | null;
}

const QUEUE_FAST = "homefix-render-fast";
const QUEUE_SLOW = "homefix-render-slow";
const TASK_PREVIEW = "homefix.render_preview";
const TASK_FINAL = "homefix.render_final";

/**
 * Push a Celery v5 task envelope onto a Redis list (the default Celery broker
 * transport). Matches the protocol that `celery -A celery_app worker` consumes
 * when configured with the JSON serializer (see render/celery_app.py).
 */
export async function enqueueCeleryTask(
  redisUrl: string,
  queue: string,
  taskName: string,
  args: unknown[],
): Promise<string> {
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  try {
    const taskId = randomUUID();
    const bodyTuple: [unknown[], Record<string, unknown>, Record<string, unknown>] = [
      args,
      {},
      { callbacks: null, errbacks: null, chain: null, chord: null },
    ];
    const body = Buffer.from(JSON.stringify(bodyTuple), "utf8").toString("base64");

    const envelope = {
      body,
      "content-encoding": "utf-8",
      "content-type": "application/json",
      headers: {
        lang: "py",
        task: taskName,
        id: taskId,
        shadow: null,
        eta: null,
        expires: null,
        group: null,
        group_index: null,
        retries: 0,
        timelimit: [null, null],
        root_id: taskId,
        parent_id: null,
        argsrepr: JSON.stringify(args),
        kwargsrepr: "{}",
        origin: process.env.FLY_APP_NAME ?? "homefix-worker-prod",
      },
      properties: {
        correlation_id: taskId,
        reply_to: createHash("sha1").update(taskId).digest("hex"),
        delivery_mode: 2,
        delivery_info: { exchange: "", routing_key: queue },
        priority: 0,
        body_encoding: "base64",
        delivery_tag: taskId,
      },
    };

    await redis.lpush(queue, JSON.stringify(envelope));
    return taskId;
  } finally {
    await redis.quit();
  }
}

export interface BlenderProviderDeps {
  supabase: SupabaseClient;
  /** Redis URL — same instance the Python Celery worker consumes from. */
  celeryBrokerUrl: string;
}

export class BlenderProvider {
  readonly name = "blender" as const;
  private readonly supabase: SupabaseClient;
  private readonly celeryBrokerUrl: string;

  constructor(deps: BlenderProviderDeps) {
    this.supabase = deps.supabase;
    this.celeryBrokerUrl = deps.celeryBrokerUrl;
  }

  /**
   * Enqueue a Celery task for an existing homefix_render_jobs row. Returns the
   * Celery task UUID (different from the row UUID; useful for tracing).
   */
  async enqueue(input: BlenderEnqueueInput): Promise<{ celeryTaskId: string; queue: string; taskName: string }> {
    const quality: BlenderQuality = input.quality ?? "preview";
    const queue = quality === "final" ? QUEUE_SLOW : QUEUE_FAST;
    const taskName = quality === "final" ? TASK_FINAL : TASK_PREVIEW;

    const { error: updateError } = await this.supabase
      .from("homefix_render_jobs")
      .update({ provider: this.name })
      .eq("id", input.homefixRenderJobId);
    if (updateError) {
      throw new Error(`BlenderProvider: failed to tag row ${input.homefixRenderJobId} with provider='blender': ${updateError.message}`);
    }

    const celeryTaskId = await enqueueCeleryTask(this.celeryBrokerUrl, queue, taskName, [input.homefixRenderJobId]);
    return { celeryTaskId, queue, taskName };
  }

  /**
   * Poll the homefix_render_jobs row until the Celery worker reaches a
   * terminal state (`completed` or `failed`).
   */
  async waitForCompletion(homefixRenderJobId: string, opts: BlenderWaitOptions = {}): Promise<BlenderWaitResult> {
    const pollIntervalMs = opts.pollIntervalMs ?? 5000;
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const { data, error } = await this.supabase
        .from("homefix_render_jobs")
        .select("status, result_url, error_message")
        .eq("id", homefixRenderJobId)
        .single();
      if (error) {
        throw new Error(`BlenderProvider: failed to poll row ${homefixRenderJobId}: ${error.message}`);
      }
      const status = (data?.status ?? "queued") as string;
      if (status === "completed") {
        return {
          status: "completed",
          resultUrl: (data?.result_url as string | null) ?? null,
          errorMessage: null,
        };
      }
      if (status === "failed") {
        return {
          status: "failed",
          resultUrl: null,
          errorMessage: (data?.error_message as string | null) ?? "blender worker reported failure",
        };
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error(`BlenderProvider: render job ${homefixRenderJobId} did not complete within ${timeoutMs}ms`);
  }
}
