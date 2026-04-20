import type { Metadata } from "next";
import PublicModelClient from "./PublicModelClient";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3000";

interface PublicModelData {
  id: string;
  prompt: string;
  stlUrl: string;
  isPublic: boolean;
  createdAt: string;
  ownerName?: string;
}

async function fetchPublicModel(id: string): Promise<PublicModelData | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/models/${id}/public`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const model = await fetchPublicModel(id);

  if (!model) {
    return {
      title: "모델을 찾을 수 없습니다",
    };
  }

  const title = `3D 모델: ${model.prompt.slice(0, 50)}`;
  const description = `AI로 생성된 3D 모델 — "${model.prompt}"`;
  const ogImageUrl = `${SITE_URL}/api/og?modelId=${id}&prompt=${encodeURIComponent(model.prompt.slice(0, 100))}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      locale: "ko_KR",
      siteName: "3D 프린팅 브로커리지",
      url: `${SITE_URL}/models/${id}/public`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: model.prompt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PublicModelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicModelClient modelId={id} />;
}
