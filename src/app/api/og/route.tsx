import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const prompt = searchParams.get("prompt") ?? "3D 모델";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #111827 0%, #1f2937 50%, #374151 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px",
            maxWidth: "900px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "80px",
              height: "80px",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.1)",
              marginBottom: "32px",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="1.5"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <path d="M3.27 6.96 12 12.01l8.73-5.05" />
              <path d="M12 22.08V12" />
            </svg>
          </div>

          <p
            style={{
              color: "white",
              fontSize: "42px",
              fontWeight: "bold",
              textAlign: "center",
              lineHeight: 1.3,
              margin: "0 0 16px 0",
            }}
          >
            {prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt}
          </p>

          <p
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: "20px",
              textAlign: "center",
              margin: 0,
            }}
          >
            AI 3D 프린팅 브로커리지
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
