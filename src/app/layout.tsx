import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#111827",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3000"
  ),
  title: "3D 프린팅 브로커리지 — AI로 3D 모델 생성부터 프린팅까지",
  description:
    "텍스트 하나로 3D 모델을 생성하고, 최적의 업체에서 프린팅까지 한 번에. AI 기반 3D 프린팅 브로커리지 서비스.",
  manifest: "/manifest.json",
  openGraph: {
    title: "3D 프린팅 브로커리지 — AI로 3D 모델 생성부터 프린팅까지",
    description:
      "텍스트 하나로 3D 모델을 생성하고, 최적의 업체에서 프린팅까지 한 번에.",
    locale: "ko_KR",
    type: "website",
    siteName: "3D 프린팅 브로커리지",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AI 3D 프린팅 브로커리지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "3D 프린팅 브로커리지 — AI로 3D 모델 생성부터 프린팅까지",
    description:
      "텍스트 하나로 3D 모델을 생성하고, 최적의 업체에서 프린팅까지 한 번에.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "3D프린트",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKR.variable} font-sans antialiased`}>
        <Providers>
          <Navbar />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
