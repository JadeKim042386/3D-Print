/**
 * image-validator.ts
 *
 * Server-side validation for reference images used in image-to-3D generation.
 * Checks content type, file size, and validates the image URL is accessible.
 */

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface ImageValidationResult {
  valid: boolean;
  contentType: string | null;
  contentLength: number | null;
  error?: string;
}

/**
 * Validate a reference image URL by performing a HEAD request.
 * Checks: accessibility, content type, and file size.
 */
export async function validateImageUrl(
  imageUrl: string
): Promise<ImageValidationResult> {
  try {
    const res = await fetch(imageUrl, { method: "HEAD" });

    if (!res.ok) {
      return {
        valid: false,
        contentType: null,
        contentLength: null,
        error: `Image URL returned ${res.status}`,
      };
    }

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
    const contentLengthStr = res.headers.get("content-length");
    const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : null;

    if (contentType && !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return {
        valid: false,
        contentType,
        contentLength,
        error: `Unsupported content type: ${contentType}. Allowed: JPEG, PNG, WebP`,
      };
    }

    if (contentLength && contentLength > MAX_FILE_SIZE) {
      return {
        valid: false,
        contentType,
        contentLength,
        error: `File too large: ${Math.round(contentLength / 1024 / 1024)}MB (max 10MB)`,
      };
    }

    return { valid: true, contentType, contentLength };
  } catch (err) {
    return {
      valid: false,
      contentType: null,
      contentLength: null,
      error: `Failed to reach image URL: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
