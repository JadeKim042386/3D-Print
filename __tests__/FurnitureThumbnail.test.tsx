/**
 * Regression tests for FurnitureThumbnail proxy behaviour.
 *
 * We extract the component logic into a local copy so we can test it in
 * isolation without bootstrapping the full FurniturePlacer (Three.js, Supabase, etc.).
 */

import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Inline copy of CATEGORY_KO and CategoryIcon ───────────────────────────────

const CATEGORY_KO: Record<string, string> = {
  sofa: "소파", 소파: "소파",
  chair: "의자", 의자: "의자",
  table: "테이블", "식탁/의자": "식탁/의자",
  desk: "책상", 책상: "책상",
  bed: "침대", 침대: "침대",
  storage: "수납장", 수납장: "수납장",
  "TV장": "TV장",
  주방가구: "주방가구",
};

function CategoryIcon({ category }: { category: string }) {
  return <svg data-testid={`icon-${category}`} aria-hidden />;
}

// ── Inline copy of the component under test ───────────────────────────────────

function FurnitureThumbnail({
  url,
  name,
  category,
}: {
  url: string | null;
  name: string;
  category?: string;
}) {
  const [failed, setFailed] = useState(false);
  const proxyUrl = url ? `/api/img-proxy?u=${encodeURIComponent(url)}` : null;
  if (!proxyUrl || failed) {
    const label = category ? (CATEGORY_KO[category] ?? category) : "가구";
    return (
      <div data-testid="fallback">
        <CategoryIcon category={category ?? ""} />
        <span data-testid="fallback-label">{label}</span>
      </div>
    );
  }
  return (
    <img
      src={proxyUrl}
      alt={name}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      data-testid="thumb"
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FurnitureThumbnail", () => {
  it("renders proxy URL when image_url is provided", () => {
    const raw = "https://www.ikea.com/images/chair.jpg";
    render(<FurnitureThumbnail url={raw} name="소파" category="sofa" />);
    const img = screen.getByTestId("thumb") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("/api/img-proxy?u=");
    expect(img.src).toContain(encodeURIComponent(raw));
  });

  it("shows fallback when url is null", () => {
    render(<FurnitureThumbnail url={null} name="의자" />);
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("thumb")).not.toBeInTheDocument();
  });

  it("shows fallback after image load error (simulates 4xx from proxy — proxy-denied URL)", () => {
    render(
      <FurnitureThumbnail
        url="https://unknown-vendor.co.kr/item.jpg"
        name="침대"
        category="bed"
      />
    );
    const img = screen.getByTestId("thumb");
    fireEvent.error(img);
    // intentional fallback — not a broken img
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("thumb")).not.toBeInTheDocument();
    // shows Korean category label so user knows it's a known item without a photo
    expect(screen.getByTestId("fallback-label")).toHaveTextContent("침대");
  });

  it("fallback shows Korean label for known category", () => {
    render(<FurnitureThumbnail url={null} name="소파" category="sofa" />);
    expect(screen.getByTestId("fallback-label")).toHaveTextContent("소파");
  });

  it("fallback shows Korean category when category key is already Korean", () => {
    render(<FurnitureThumbnail url={null} name="수납장" category="수납장" />);
    expect(screen.getByTestId("fallback-label")).toHaveTextContent("수납장");
  });

  it("fallback shows raw category when category is unknown", () => {
    render(<FurnitureThumbnail url={null} name="특수가구" category="custom-item" />);
    expect(screen.getByTestId("fallback-label")).toHaveTextContent("custom-item");
  });

  it("fallback shows 가구 when no category provided", () => {
    render(<FurnitureThumbnail url={null} name="알 수 없음" />);
    expect(screen.getByTestId("fallback-label")).toHaveTextContent("가구");
  });

  it("sets referrerPolicy, loading, and decoding attributes", () => {
    render(<FurnitureThumbnail url="https://cdn.iloom.com/a.jpg" name="테이블" category="table" />);
    const img = screen.getByTestId("thumb") as HTMLImageElement;
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });
});
