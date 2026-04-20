/**
 * export.ts
 *
 * tRPC router for multi-format model export.
 * Handles requesting conversions, checking status, and listing available exports.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";

const exportFormatSchema = z.enum(["stl", "obj", "glb", "gltf", "3mf"]);

export const exportRouter = router({
  /**
   * Request a model export in a specific format.
   * If the export already exists and is ready, returns it immediately.
   * If pending/converting, returns current status.
   * Otherwise creates a new conversion job.
   */
  request: protectedProcedure
    .input(
      z.object({
        modelId: z.string().uuid(),
        format: exportFormatSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { modelId, format } = input;

      // Verify model belongs to user and is ready
      const { data: model } = await ctx.supabase
        .from("models")
        .select("id, file_url, format, user_id, status")
        .eq("id", modelId)
        .eq("user_id", ctx.user.id)
        .single();

      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }
      if (model.status !== "ready" || !model.file_url) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Model is not ready for export" });
      }

      // If requesting the same format as source, return original file
      const sourceFormat = (model.format ?? "glb") as "stl" | "glb";
      if (format === sourceFormat || (format === "gltf" && sourceFormat === "glb")) {
        return {
          exportId: null,
          status: "ready" as const,
          format,
          fileUrl: model.file_url,
        };
      }

      // Check if export already exists
      const { data: existing } = await ctx.supabase
        .from("model_exports")
        .select("id, status, file_url")
        .eq("model_id", modelId)
        .eq("format", format)
        .single();

      if (existing) {
        return {
          exportId: existing.id,
          status: existing.status as "pending" | "converting" | "ready" | "failed",
          format,
          fileUrl: existing.file_url,
        };
      }

      // Create export record
      const { data: exportRecord, error: insertError } = await ctx.supabase
        .from("model_exports")
        .insert({
          model_id: modelId,
          format,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError || !exportRecord) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create export: ${insertError?.message}`,
        });
      }

      // Enqueue conversion job
      if (!ctx.exportQueue) {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Export queue unavailable" });
      }

      await ctx.exportQueue.add("format-convert", {
        exportId: exportRecord.id,
        modelId,
        sourceFileUrl: model.file_url,
        sourceFormat,
        targetFormat: format,
      });

      return {
        exportId: exportRecord.id,
        status: "pending" as const,
        format,
        fileUrl: null,
      };
    }),

  /**
   * Check the status of an export.
   */
  status: protectedProcedure
    .input(z.object({ exportId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: exp } = await ctx.supabase
        .from("model_exports")
        .select("id, model_id, format, status, file_url, file_size_bytes, error_message")
        .eq("id", input.exportId)
        .single();

      if (!exp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
      }

      // Verify user owns the model
      const { data: model } = await ctx.supabase
        .from("models")
        .select("user_id")
        .eq("id", exp.model_id)
        .eq("user_id", ctx.user.id)
        .single();

      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
      }

      return {
        exportId: exp.id,
        format: exp.format,
        status: exp.status,
        fileUrl: exp.file_url,
        fileSizeBytes: exp.file_size_bytes,
        errorMessage: exp.error_message,
      };
    }),

  /**
   * List all available exports for a model.
   */
  list: protectedProcedure
    .input(z.object({ modelId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const { data: model } = await ctx.supabase
        .from("models")
        .select("id, file_url, format, user_id")
        .eq("id", input.modelId)
        .eq("user_id", ctx.user.id)
        .single();

      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      const { data: exports } = await ctx.supabase
        .from("model_exports")
        .select("id, format, status, file_url, file_size_bytes")
        .eq("model_id", input.modelId)
        .order("created_at", { ascending: true });

      // Include the source format as always-available
      const sourceFormat = model.format ?? "glb";
      const available = [
        {
          format: sourceFormat,
          status: "ready" as const,
          fileUrl: model.file_url,
          isSource: true,
        },
        ...(exports ?? []).map((e) => ({
          format: e.format,
          status: e.status,
          fileUrl: e.file_url,
          isSource: false,
        })),
      ];

      return { modelId: input.modelId, exports: available };
    }),

  /**
   * Get a pre-signed download URL for an export (1-hour expiry).
   */
  downloadUrl: protectedProcedure
    .input(
      z.object({
        modelId: z.string().uuid(),
        format: exportFormatSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const { modelId, format } = input;

      // Verify ownership
      const { data: model } = await ctx.supabase
        .from("models")
        .select("id, file_url, format, user_id")
        .eq("id", modelId)
        .eq("user_id", ctx.user.id)
        .single();

      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      const sourceFormat = model.format ?? "glb";

      // Source format: use model's own file_url
      if (format === sourceFormat || (format === "gltf" && sourceFormat === "glb")) {
        // Create a signed URL from the storage path
        const urlPath = new URL(model.file_url!).pathname;
        const bucketPath = urlPath.split("/storage/v1/object/public/models/")[1];

        if (bucketPath) {
          const { data: signedData } = await ctx.supabase.storage
            .from("models")
            .createSignedUrl(bucketPath, 3600);

          return {
            format,
            downloadUrl: signedData?.signedUrl ?? model.file_url!,
            expiresInSeconds: 3600,
          };
        }

        return {
          format,
          downloadUrl: model.file_url!,
          expiresInSeconds: null,
        };
      }

      // Check for converted export
      const { data: exp } = await ctx.supabase
        .from("model_exports")
        .select("file_url, status")
        .eq("model_id", modelId)
        .eq("format", format)
        .eq("status", "ready")
        .single();

      if (!exp?.file_url) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Export not ready" });
      }

      // Create signed URL
      const urlPath = new URL(exp.file_url).pathname;
      const bucketPath = urlPath.split("/storage/v1/object/public/models/")[1];

      if (bucketPath) {
        const { data: signedData } = await ctx.supabase.storage
          .from("models")
          .createSignedUrl(bucketPath, 3600);

        return {
          format,
          downloadUrl: signedData?.signedUrl ?? exp.file_url,
          expiresInSeconds: 3600,
        };
      }

      return {
        format,
        downloadUrl: exp.file_url,
        expiresInSeconds: null,
      };
    }),
});
