import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTNAMES = new Set([
  "www.ikea.com",
  "image.hanssem.com",
  "cdn.iloom.com",
  "img.danuri.io",
  "img.29cm.co.kr",
  "kr.sidiz.com",
  "planning-cdn.fursys.com",
  "static.hyundailivart.co.kr",
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return NextResponse.json({ error: "missing u" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (url.protocol !== "https:") {
    return new NextResponse(null, { status: 404 });
  }

  if (!ALLOWED_HOSTNAMES.has(url.hostname)) {
    return new NextResponse(null, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      headers: { "User-Agent": "DPR-imgproxy/1.0" },
      redirect: "follow",
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return new NextResponse(null, { status: 404 });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
