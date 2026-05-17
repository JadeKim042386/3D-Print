import { describe, it, expect, vi, beforeEach } from "vitest";

// ioredis is fully mocked — no actual Redis required for these unit tests.
const lpushMock = vi.fn();
const quitMock = vi.fn();
const pingMock = vi.fn().mockResolvedValue("PONG");
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    lpush: lpushMock,
    quit: quitMock,
    ping: pingMock,
  })),
}));

import { BlenderProvider, enqueueCeleryTask } from "../providers/blender.js";

function makeSupabaseMock(rowSequence: Array<{ status: string; result_url?: string | null; error_message?: string | null }>) {
  let call = 0;
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const single = vi.fn(async () => {
    const row = rowSequence[Math.min(call, rowSequence.length - 1)];
    call += 1;
    return { data: row, error: null };
  });
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ single })) }));
  const from = vi.fn(() => ({ update, select }));
  return { from, _update: update };
}

describe("enqueueCeleryTask", () => {
  beforeEach(() => {
    lpushMock.mockReset();
    quitMock.mockReset();
    lpushMock.mockResolvedValue(1);
    quitMock.mockResolvedValue("OK");
  });

  it("pushes a valid Celery v5 envelope onto the requested queue", async () => {
    const taskId = await enqueueCeleryTask("redis://test", "homefix-render-fast", "homefix.render_preview", ["job-uuid"]);
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lpushMock).toHaveBeenCalledTimes(1);

    const [queue, raw] = lpushMock.mock.calls[0]!;
    expect(queue).toBe("homefix-render-fast");
    const envelope = JSON.parse(raw as string);

    expect(envelope["content-encoding"]).toBe("utf-8");
    expect(envelope["content-type"]).toBe("application/json");
    expect(envelope.headers.lang).toBe("py");
    expect(envelope.headers.task).toBe("homefix.render_preview");
    expect(envelope.headers.id).toBe(taskId);
    expect(envelope.headers.root_id).toBe(taskId);
    expect(envelope.properties.body_encoding).toBe("base64");
    expect(envelope.properties.delivery_info.routing_key).toBe("homefix-render-fast");

    // Body must decode to [args, kwargs, options-tuple]
    const decoded = JSON.parse(Buffer.from(envelope.body, "base64").toString("utf8"));
    expect(decoded).toHaveLength(3);
    expect(decoded[0]).toEqual(["job-uuid"]);
    expect(decoded[1]).toEqual({});
    expect(decoded[2]).toMatchObject({ callbacks: null, errbacks: null });

    expect(quitMock).toHaveBeenCalledTimes(1);
  });
});

describe("BlenderProvider", () => {
  beforeEach(() => {
    lpushMock.mockReset();
    quitMock.mockReset();
    lpushMock.mockResolvedValue(1);
    quitMock.mockResolvedValue("OK");
  });

  describe("enqueue", () => {
    it("routes preview quality to homefix-render-fast + render_preview", async () => {
      const sb = makeSupabaseMock([{ status: "queued" }]);
      const provider = new BlenderProvider({ supabase: sb as never, celeryBrokerUrl: "redis://test" });
      const { queue, taskName } = await provider.enqueue({ homefixRenderJobId: "row-1", quality: "preview" });
      expect(queue).toBe("homefix-render-fast");
      expect(taskName).toBe("homefix.render_preview");
      expect(sb._update).toHaveBeenCalledWith({ provider: "blender" });
      const lastCall = lpushMock.mock.calls[0]!;
      expect(lastCall[0]).toBe("homefix-render-fast");
    });

    it("routes final quality to homefix-render-slow + render_final", async () => {
      const sb = makeSupabaseMock([{ status: "queued" }]);
      const provider = new BlenderProvider({ supabase: sb as never, celeryBrokerUrl: "redis://test" });
      const { queue, taskName } = await provider.enqueue({ homefixRenderJobId: "row-1", quality: "final" });
      expect(queue).toBe("homefix-render-slow");
      expect(taskName).toBe("homefix.render_final");
    });

    it("defaults to preview when quality is omitted", async () => {
      const sb = makeSupabaseMock([{ status: "queued" }]);
      const provider = new BlenderProvider({ supabase: sb as never, celeryBrokerUrl: "redis://test" });
      const { queue } = await provider.enqueue({ homefixRenderJobId: "row-1" });
      expect(queue).toBe("homefix-render-fast");
    });
  });

  describe("waitForCompletion", () => {
    it("returns completed when Celery worker writes status='completed'", async () => {
      const sb = makeSupabaseMock([
        { status: "processing" },
        { status: "completed", result_url: "https://supabase.example/renders/row-1.png" },
      ]);
      const provider = new BlenderProvider({ supabase: sb as never, celeryBrokerUrl: "redis://test" });
      const res = await provider.waitForCompletion("row-1", { pollIntervalMs: 1, timeoutMs: 1000 });
      expect(res.status).toBe("completed");
      expect(res.resultUrl).toBe("https://supabase.example/renders/row-1.png");
      expect(res.errorMessage).toBeNull();
    });

    it("returns failed with error_message when Celery reports failure", async () => {
      const sb = makeSupabaseMock([
        { status: "failed", error_message: "blender crashed", result_url: null },
      ]);
      const provider = new BlenderProvider({ supabase: sb as never, celeryBrokerUrl: "redis://test" });
      const res = await provider.waitForCompletion("row-1", { pollIntervalMs: 1, timeoutMs: 1000 });
      expect(res.status).toBe("failed");
      expect(res.errorMessage).toBe("blender crashed");
      expect(res.resultUrl).toBeNull();
    });

    it("times out if Celery never reaches a terminal state", async () => {
      const sb = makeSupabaseMock([{ status: "queued" }]);
      const provider = new BlenderProvider({ supabase: sb as never, celeryBrokerUrl: "redis://test" });
      await expect(
        provider.waitForCompletion("row-1", { pollIntervalMs: 5, timeoutMs: 30 })
      ).rejects.toThrow(/did not complete/);
    });
  });
});
