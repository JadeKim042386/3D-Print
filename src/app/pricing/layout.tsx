import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3000";

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "3D 프린팅 브로커리지 요금제",
  url: `${SITE_URL}/pricing`,
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      item: {
        "@type": "Product",
        name: "무료 플랜",
        description: "AI 3D 모델 생성 무료 체험 — 월 10 크레딧",
        offers: {
          "@type": "Offer",
          priceCurrency: "KRW",
          price: "0",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/pricing`,
        },
      },
    },
    {
      "@type": "ListItem",
      position: 2,
      item: {
        "@type": "Product",
        name: "프로 플랜",
        description: "AI 3D 모델 생성 프로 플랜 — 월 100 크레딧, 우선 처리, 워터마크 없음",
        offers: {
          "@type": "Offer",
          priceCurrency: "KRW",
          price: "19900",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/pricing`,
        },
      },
    },
    {
      "@type": "ListItem",
      position: 3,
      item: {
        "@type": "Product",
        name: "비즈니스 플랜",
        description: "AI 3D 모델 생성 비즈니스 플랜 — 월 500 크레딧, API 액세스, 전담 지원",
        offers: {
          "@type": "Offer",
          priceCurrency: "KRW",
          price: "49900",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/pricing`,
        },
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "요금제 — AI 3D 프린팅 브로커리지",
  description:
    "무료부터 비즈니스 플랜까지. AI 3D 모델 생성과 3D 프린팅 대행 서비스 요금제를 비교하고 나에게 맞는 플랜을 선택하세요.",
  keywords: [
    "3D 프린팅 요금제",
    "AI 3D 모델 생성 가격",
    "3D 프린트 대행 비용",
    "3D 프린팅 구독",
  ],
  openGraph: {
    title: "요금제 — AI 3D 프린팅 브로커리지",
    description:
      "무료부터 비즈니스 플랜까지. AI 3D 모델 생성과 3D 프린팅 대행 서비스 요금제를 비교하세요.",
    locale: "ko_KR",
    type: "website",
  },
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      {children}
    </>
  );
}
