import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "인테리어 플래너 — HomeFix | AI 3D 공간 설계",
  description:
    "방 치수를 설정하고 가구를 배치하면 AI가 실사 3D 렌더링을 생성합니다. 한국 아파트 맞춤 인테리어 플래너.",
  keywords: ["인테리어 플래너", "3D 인테리어", "가구 배치", "한국 아파트", "AI 인테리어"],
  openGraph: {
    title: "인테리어 플래너 — HomeFix",
    description: "방 치수를 설정하고 가구를 배치하면 AI가 실사 3D 렌더링을 생성합니다.",
    locale: "ko_KR",
    type: "website",
  },
  alternates: { canonical: "/homefix" },
};

export default function HomefixLayout({ children }: { children: React.ReactNode }) {
  return children;
}
