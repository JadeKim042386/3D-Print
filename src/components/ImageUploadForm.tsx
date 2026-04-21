"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { generateModelFromImage } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { analytics } from "@/lib/analytics";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export default function ImageUploadForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [widthMm, setWidthMm] = useState<string>("100");
  const [heightMm, setHeightMm] = useState<string>("100");
  const [depthMm, setDepthMm] = useState<string>("100");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setError(t("imageUpload.invalidType"));
      return;
    }
    if (selectedFile.size > MAX_SIZE_BYTES) {
      setError(t("imageUpload.tooLarge"));
      return;
    }
    setError(null);
    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !accessToken) return;

    const w = parseFloat(widthMm);
    const h = parseFloat(heightMm);
    const d = parseFloat(depthMm);
    if (!w || !h || !d || w < 1 || h < 1 || d < 1 || w > 2000 || h > 2000 || d > 2000) {
      setError(t("imageUpload.invalidDimensions"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Upload image to Supabase Storage
      const ext = file.name.split(".").pop() ?? "jpg";
      const storagePath = `reference-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("models")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from("models")
        .getPublicUrl(storagePath);

      // Call image-to-3D generation
      analytics.generationSubmitted("image");
      const result = await generateModelFromImage(
        {
          imageUrl: urlData.publicUrl,
          dimensions: {
            width_mm: w,
            height_mm: h,
            depth_mm: d,
            mode: "proportional",
          },
        },
        accessToken
      );

      router.push(`/models/${result.modelId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col gap-4">
        {/* Image drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="relative w-full min-h-[200px] rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors overflow-hidden"
        >
          {preview ? (
            <img
              src={preview}
              alt={t("imageUpload.preview")}
              className="w-full h-full object-contain max-h-[300px]"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <svg
                width="40"
                height="40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-gray-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                />
              </svg>
              <p className="text-sm text-gray-500">{t("imageUpload.dropHint")}</p>
              <p className="text-xs text-gray-400">{t("imageUpload.formats")}</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
        </div>

        {/* Dimension inputs */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("imageUpload.width")} (mm)
            </label>
            <input
              type="number"
              value={widthMm}
              onChange={(e) => setWidthMm(e.target.value)}
              min={1}
              max={2000}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("imageUpload.height")} (mm)
            </label>
            <input
              type="number"
              value={heightMm}
              onChange={(e) => setHeightMm(e.target.value)}
              min={1}
              max={2000}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("imageUpload.depth")} (mm)
            </label>
            <input
              type="number"
              value={depthMm}
              onChange={(e) => setDepthMm(e.target.value)}
              min={1}
              max={2000}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              disabled={isLoading}
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={isLoading || !file || !accessToken}
          className="w-full bg-gray-900 text-white py-3 px-6 rounded-xl text-base font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {isLoading ? t("imageUpload.generating") : t("imageUpload.submit")}
        </button>
      </div>
    </form>
  );
}
