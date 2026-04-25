import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 3D 모델 갤러리 — 3D 프린팅 브로커리지",
  description:
    "사용자들이 AI로 생성한 3D 모델을 구경해보세요. 텍스트 하나로 만들어진 고품질 3D 프린팅 모델 갤러리.",
  keywords: [
    "AI 3D 모델",
    "3D 프린팅",
    "AI 3D 생성",
    "3D 모델 갤러리",
    "3D 프린트 대행",
  ],
  openGraph: {
    title: "AI 3D 모델 갤러리 — 3D 프린팅 브로커리지",
    description:
      "사용자들이 AI로 생성한 3D 모델을 구경해보세요. 텍스트 하나로 만들어진 고품질 3D 프린팅 모델 갤러리.",
    locale: "ko_KR",
    type: "website",
  },
  alternates: {
    canonical: "/gallery",
  },
};

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
