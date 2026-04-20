import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateImageUrl } from "../lib/image-validator.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("image-validator", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should accept a valid JPEG image", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "content-type": "image/jpeg",
        "content-length": "500000",
      }),
    });

    const result = await validateImageUrl("https://example.com/photo.jpg");
    expect(result.valid).toBe(true);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.contentLength).toBe(500000);
  });

  it("should accept a valid PNG image", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "content-type": "image/png",
        "content-length": "2000000",
      }),
    });

    const result = await validateImageUrl("https://example.com/photo.png");
    expect(result.valid).toBe(true);
  });

  it("should accept a valid WebP image", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "content-type": "image/webp",
        "content-length": "100000",
      }),
    });

    const result = await validateImageUrl("https://example.com/photo.webp");
    expect(result.valid).toBe(true);
  });

  it("should reject unsupported content types", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "content-type": "image/gif",
        "content-length": "100000",
      }),
    });

    const result = await validateImageUrl("https://example.com/animation.gif");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported content type");
  });

  it("should reject files exceeding 10MB", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "content-type": "image/jpeg",
        "content-length": String(15 * 1024 * 1024),
      }),
    });

    const result = await validateImageUrl("https://example.com/huge.jpg");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("should reject unreachable URLs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers({}),
    });

    const result = await validateImageUrl("https://example.com/missing.jpg");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("404");
  });

  it("should handle network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await validateImageUrl("https://unreachable.com/img.jpg");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Network timeout");
  });

  it("should handle content-type with charset parameter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "content-type": "image/jpeg; charset=utf-8",
        "content-length": "500000",
      }),
    });

    const result = await validateImageUrl("https://example.com/photo.jpg");
    expect(result.valid).toBe(true);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("should accept images without content-length header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "content-type": "image/png",
      }),
    });

    const result = await validateImageUrl("https://example.com/photo.png");
    expect(result.valid).toBe(true);
    expect(result.contentLength).toBeNull();
  });
});
