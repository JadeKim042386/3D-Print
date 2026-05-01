"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function trpcQuery(path: string, input: unknown, token: string) {
  const url = `${API_BASE_URL}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

interface RenderJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  result_url: string | null;
  error_message: string | null;
  camera_preset: string;
  created_at: string;
  completed_at: string | null;
}

export default function RenderStatusPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const accessToken = useAuthStore((s) => s.accessToken);

  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!accessToken || !jobId) return;
    try {
      const data = await trpcQuery("homefix.render.status", { job_id: jobId }, accessToken);
      setJob(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태를 불러오지 못했습니다.");
    }
  }, [accessToken, jobId]);

  useEffect(() => {
    poll();
  }, [poll]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "queued" || job.status === "processing") {
      const timer = setInterval(poll, 4000);
      return () => clearInterval(timer);
    }
  }, [job, poll]);

  if (!accessToken) {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
        <p className="text-sm text-gray-500">로그인이 필요합니다.</p>
      </div>
    );
  }

  const isPending = !job || job.status === "queued" || job.status === "processing";
  const isDone = job?.status === "completed";
  const isFailed = job?.status === "failed";

  return (
    <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.push("/homefix")}
          className="mb-6 text-sm text-gray-500 hover:text-gray-700"
        >
          ← 홈으로
        </button>

        <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">3D 렌더링 결과</h1>

        {error && (
          <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {isPending && !error && (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
            <p className="text-sm font-medium text-gray-700">
              {job?.status === "processing" ? "렌더링 중…" : "렌더링 대기 중…"}
            </p>
            <p className="mt-1 text-xs text-gray-400">AI가 공간을 3D로 변환하고 있습니다. 잠시만 기다려주세요.</p>
          </div>
        )}

        {isDone && job.result_url && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <img
              src={job.result_url}
              alt="3D 렌더링 결과"
              className="w-full object-cover"
            />
            <div className="p-5">
              <p className="text-sm font-semibold text-gray-900">렌더링 완료</p>
              {job.camera_preset && (
                <p className="mt-1 text-xs text-gray-400">카메라: {job.camera_preset}</p>
              )}
              <div className="mt-4 flex gap-2">
                <a
                  href={job.result_url}
                  download
                  className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  이미지 저장
                </a>
                <button
                  type="button"
                  onClick={() => router.push("/homefix")}
                  className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  홈으로
                </button>
              </div>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6">
            <p className="text-sm font-semibold text-red-700">렌더링 실패</p>
            {job.error_message && (
              <p className="mt-1 text-xs text-red-500">{job.error_message}</p>
            )}
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-4 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
